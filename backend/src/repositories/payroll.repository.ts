import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PayrollRun, PayrollRunStatus } from '../entities/PayrollRun.entity';
import { PayrollRecord, PayrollRecordStatus } from '../entities/PayrollRecord.entity';
import { PayslipDocument } from '../entities/PayslipDocument.entity';
import { PayrollImportJob } from '../entities/PayrollImportJob.entity';

export class PayrollRepository {
  private runRepo: Repository<PayrollRun>;
  private recordRepo: Repository<PayrollRecord>;
  private docRepo: Repository<PayslipDocument>;
  private jobRepo: Repository<PayrollImportJob>;

  constructor() {
    this.runRepo = AppDataSource.getRepository(PayrollRun);
    this.recordRepo = AppDataSource.getRepository(PayrollRecord);
    this.docRepo = AppDataSource.getRepository(PayslipDocument);
    this.jobRepo = AppDataSource.getRepository(PayrollImportJob);
  }

  // ── PayrollRun ──

  async createRun(data: Partial<PayrollRun>): Promise<PayrollRun> {
    return this.runRepo.save(this.runRepo.create(data));
  }

  async findRunById(id: string): Promise<PayrollRun | null> {
    return this.runRepo.findOne({ where: { id }, relations: ['records'] });
  }

  async findRuns(filters?: {
    month?: number;
    year?: number;
    status?: PayrollRunStatus;
  }): Promise<PayrollRun[]> {
    const qb = this.runRepo.createQueryBuilder('pr');
    if (filters?.month) qb.andWhere('pr.month = :month', { month: filters.month });
    if (filters?.year) qb.andWhere('pr.year = :year', { year: filters.year });
    if (filters?.status) qb.andWhere('pr.status = :status', { status: filters.status });
    return qb.orderBy('pr.createdAt', 'DESC').getMany();
  }

  async updateRun(id: string, data: Partial<PayrollRun>): Promise<void> {
    await this.runRepo.update(id, data as any);
  }

  // ── PayrollRecord ──

  async createRecord(data: Partial<PayrollRecord>): Promise<PayrollRecord> {
    return this.recordRepo.save(this.recordRepo.create(data));
  }

  async createRecords(data: Partial<PayrollRecord>[]): Promise<PayrollRecord[]> {
    const entities = data.map((d) => this.recordRepo.create(d));
    return this.recordRepo.save(entities);
  }

  async findRecordById(id: string): Promise<PayrollRecord | null> {
    return this.recordRepo.findOne({
      where: { id },
      relations: ['payslipDocument'],
    });
  }

  async findRecordsByEmployee(
    employeeId: string,
    filters?: { year?: number },
  ): Promise<PayrollRecord[]> {
    const qb = this.recordRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.payslipDocument', 'pd')
      .where('pr.employeeId = :employeeId', { employeeId })
      .andWhere('pr.status != :draft', { draft: PayrollRecordStatus.DRAFT })
      .andWhere('pd.filePath = :releasedMarker', { releasedMarker: 'released' });
    if (filters?.year) qb.andWhere('pr.year = :year', { year: filters.year });
    return qb.orderBy('pr.year', 'DESC').addOrderBy('pr.month', 'DESC').getMany();
  }

  async findRecords(filters?: {
    month?: number;
    year?: number;
    status?: PayrollRecordStatus;
    payrollRunId?: string;
    search?: string;
  }): Promise<PayrollRecord[]> {
    const qb = this.recordRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.payslipDocument', 'pd');
    if (filters?.month) qb.andWhere('pr.month = :month', { month: filters.month });
    if (filters?.year) qb.andWhere('pr.year = :year', { year: filters.year });
    if (filters?.status) qb.andWhere('pr.status = :status', { status: filters.status });
    if (filters?.payrollRunId)
      qb.andWhere('pr.payrollRunId = :runId', { runId: filters.payrollRunId });
    if (filters?.search) {
      qb.andWhere(
        `(pr."employeeSnapshot"->>'employeeName' ILIKE :q OR pr."employeeSnapshot"->>'employeeCode' ILIKE :q)`,
        { q: `%${filters.search}%` },
      );
    }
    return qb.orderBy('pr.createdAt', 'DESC').getMany();
  }

  async findExistingRecord(
    employeeId: string,
    month: number,
    year: number,
  ): Promise<PayrollRecord | null> {
    return this.recordRepo.findOne({
      where: { employeeId, month, year },
      relations: ['payslipDocument'],
    });
  }

  async updateRecord(id: string, data: Partial<PayrollRecord>): Promise<void> {
    await this.recordRepo.update(id, data as any);
  }

  async saveRecord(record: PayrollRecord): Promise<PayrollRecord> {
    return this.recordRepo.save(record);
  }

  async deleteRecord(id: string): Promise<void> {
    await this.recordRepo.delete(id);
  }

  async countRecords(filters?: {
    month?: number;
    year?: number;
    status?: PayrollRecordStatus;
  }): Promise<number> {
    const qb = this.recordRepo.createQueryBuilder('pr');
    if (filters?.month) qb.andWhere('pr.month = :month', { month: filters.month });
    if (filters?.year) qb.andWhere('pr.year = :year', { year: filters.year });
    if (filters?.status) qb.andWhere('pr.status = :status', { status: filters.status });
    return qb.getCount();
  }

  // ── PayslipDocument ──

  async createDocument(data: Partial<PayslipDocument>): Promise<PayslipDocument> {
    return this.docRepo.save(this.docRepo.create(data));
  }

  async findDocByRecordId(recordId: string): Promise<PayslipDocument | null> {
    return this.docRepo.findOne({ where: { payrollRecordId: recordId } });
  }

  async updateDocument(id: string, data: Partial<PayslipDocument>): Promise<void> {
    await this.docRepo.update(id, data as any);
  }

  // ── PayrollImportJob ──

  async createJob(data: Partial<PayrollImportJob>): Promise<PayrollImportJob> {
    return this.jobRepo.save(this.jobRepo.create(data));
  }

  async findJobById(id: string): Promise<PayrollImportJob | null> {
    return this.jobRepo.findOne({ where: { id } });
  }

  async updateJob(id: string, data: Partial<PayrollImportJob>): Promise<void> {
    await this.jobRepo.update(id, data as any);
  }
}
