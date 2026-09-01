import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { EmployeeSalaryStructure } from '../entities/EmployeeSalaryStructure.entity';
import { EmployeeSalaryComponent } from '../entities/EmployeeSalaryComponent.entity';
import { EmployeeStatutoryBreakdown } from '../entities/EmployeeStatutoryBreakdown.entity';
import { SalaryStructureStatus } from '../salary/salary.enums';

interface SaveStructureInput {
  structure: Partial<EmployeeSalaryStructure>;
  components: Partial<EmployeeSalaryComponent>[];
  statutoryBreakdowns: Partial<EmployeeStatutoryBreakdown>[];
}

export class EmployeeSalaryStructureRepository {
  private structureRepo: Repository<EmployeeSalaryStructure>;

  constructor() {
    this.structureRepo = AppDataSource.getRepository(EmployeeSalaryStructure);
  }

  async findLatestByEmployee(employeeId: string): Promise<EmployeeSalaryStructure | null> {
    return this.structureRepo.findOne({
      where: { employeeId },
      relations: ['components', 'statutoryBreakdowns', 'employee', 'organizationSalaryConfig'],
      order: {
        effectiveFrom: 'DESC',
        createdAt: 'DESC',
        components: { displayOrder: 'ASC' },
      },
    });
  }

  async findById(id: string): Promise<EmployeeSalaryStructure | null> {
    return this.structureRepo.findOne({
      where: { id },
      relations: ['components', 'statutoryBreakdowns', 'employee', 'organizationSalaryConfig'],
      order: { components: { displayOrder: 'ASC' } },
    });
  }

  async listLatestByEmployee(): Promise<EmployeeSalaryStructure[]> {
    const all = await this.structureRepo.find({
      relations: ['components', 'statutoryBreakdowns', 'employee'],
      order: { createdAt: 'DESC', components: { displayOrder: 'ASC' } },
    });
    const map = new Map<string, EmployeeSalaryStructure>();
    for (const row of all) {
      if (!map.has(row.employeeId)) {
        map.set(row.employeeId, row);
      }
    }
    return Array.from(map.values());
  }

  async markEmployeeStructuresInactive(employeeId: string): Promise<void> {
    await this.structureRepo.update(
      { employeeId, status: SalaryStructureStatus.ACTIVE },
      { status: SalaryStructureStatus.INACTIVE },
    );
  }

  async updateBankingInfo(id: string, bankingInfo: Record<string, unknown>): Promise<void> {
    await this.structureRepo.update(id, { bankingInfo } as any);
  }

  async saveStructureWithChildren(input: SaveStructureInput): Promise<EmployeeSalaryStructure> {
    return AppDataSource.transaction(async (manager) => {
      const structureRepo = manager.getRepository(EmployeeSalaryStructure);
      const componentRepo = manager.getRepository(EmployeeSalaryComponent);
      const statutoryRepo = manager.getRepository(EmployeeStatutoryBreakdown);

      await structureRepo.update(
        {
          employeeId: input.structure.employeeId as string,
          status: SalaryStructureStatus.ACTIVE,
        },
        { status: SalaryStructureStatus.INACTIVE },
      );

      const structureEntity = structureRepo.create({
        ...input.structure,
        status: SalaryStructureStatus.ACTIVE,
      });
      const savedStructure = await structureRepo.save(structureEntity);

      const componentEntities = input.components.map((component) =>
        componentRepo.create({
          ...component,
          componentCode: component.componentCode?.toUpperCase(),
          percentageOf: component.percentageOf
            ? String(component.percentageOf).toUpperCase()
            : null,
          employeeSalaryStructureId: savedStructure.id,
          metadata: component.metadata ?? {},
        }),
      );
      const statutoryEntities = input.statutoryBreakdowns.map((entry) =>
        statutoryRepo.create({
          ...entry,
          employeeSalaryStructureId: savedStructure.id,
          metadata: entry.metadata ?? {},
        }),
      );

      await componentRepo.save(componentEntities);
      await statutoryRepo.save(statutoryEntities);

      return structureRepo.findOneOrFail({
        where: { id: savedStructure.id },
        relations: ['components', 'statutoryBreakdowns', 'employee', 'organizationSalaryConfig'],
        order: { components: { displayOrder: 'ASC' } },
      });
    });
  }
}
