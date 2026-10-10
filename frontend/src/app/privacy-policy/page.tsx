import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Connect HR",
  description: "Privacy Policy for the Connect HR employee and human resources application.",
};

const Section = ({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-24 border-t border-slate-200 pt-8">
    <h2 className="font-[Manrope] text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
      {title}
    </h2>
    <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-600">{children}</div>
  </section>
);

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#F5F8FC] px-4 py-8 sm:px-6 sm:py-12">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,43,76,0.08)]">
        <header className="bg-gradient-to-br from-[#061F3A] via-[#084F91] to-[#0B8C6A] px-6 py-10 text-white sm:px-12 sm:py-14">
          <Link
            href="/login"
            className="inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 font-[Manrope] text-sm font-extrabold backdrop-blur hover:bg-white/15"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-sm font-black text-[#0B72E7]">HR</span>
            Connect HR
          </Link>
          <h1 className="mt-8 font-[Manrope] text-3xl font-extrabold tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
            This policy explains how Connect HR handles employee, attendance, payroll, and related information.
          </p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
            Effective and last updated: 9 October 2026
          </p>
        </header>

        <div className="space-y-9 px-6 py-10 sm:px-12 sm:py-12">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-[15px] leading-7 text-slate-700">
            <strong className="text-slate-900">Connect HR</strong> is provided by Luxmorai Technologies Private Limited
            ("Luxmorai", "we", "us", or "our"). Organizations use Connect HR to administer their workforce.
            The employer or subscribing organization determines which employee information is entered and how it is
            used for employment purposes; Luxmorai operates the application and its supporting services.
          </div>

          <nav aria-label="Privacy policy contents" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-[Manrope] text-sm font-extrabold text-slate-900">On this page</p>
            <div className="mt-3 grid gap-2 text-sm font-semibold text-[#0B72E7] sm:grid-cols-2">
              <a href="#information">Information we handle</a>
              <a href="#use">How information is used</a>
              <a href="#sharing">Sharing and service providers</a>
              <a href="#choices">Permissions and choices</a>
              <a href="#retention">Retention and deletion</a>
              <a href="#contact">Contact us</a>
            </div>
          </nav>

          <Section title="Scope">
            <p>
              This Privacy Policy applies to the Connect HR Android application, progressive web application, website,
              and related services. It applies to employees, HR personnel, administrators, and authorized reviewers who
              access Connect HR. It does not govern independent services or websites that we do not control.
            </p>
          </Section>

          <Section id="information" title="Information we handle">
            <p>Depending on your organization&apos;s configuration and the features you use, Connect HR may handle:</p>
            <ul className="list-disc space-y-3 pl-6 marker:text-[#0B72E7]">
              <li>
                <strong className="text-slate-800">Account and employment information:</strong> name, work email,
                employee ID, role, department, designation, employment type and status, joining or leaving dates,
                reporting manager, shift, login status, and profile photograph.
              </li>
              <li>
                <strong className="text-slate-800">Personal and contact information:</strong> telephone and WhatsApp
                numbers, date of birth, gender, marital status, nationality, residential address, and emergency-contact
                details.
              </li>
              <li>
                <strong className="text-slate-800">Government and statutory information:</strong> Aadhaar and PAN
                details, UAN, PF and ESI information, and copies of identity or employment documents that you or your HR
                team upload.
              </li>
              <li>
                <strong className="text-slate-800">Education and employment history:</strong> qualifications,
                institution, graduation year, prior experience, previous employer, designation, compensation, resume,
                certificates, offer and relieving documents, and related onboarding records.
              </li>
              <li>
                <strong className="text-slate-800">Attendance and location:</strong> check-in and check-out time,
                attendance status, work-session information, remarks, end-of-day descriptions, attendance photographs,
                and precise latitude and longitude when location validation is enabled. Connect HR does not use location
                for continuous or background tracking.
              </li>
              <li>
                <strong className="text-slate-800">Leave information:</strong> leave category, dates, duration, reason,
                approval history, balances, and supporting information submitted with a request. A leave reason may
                reveal health-related information if you choose to include it.
              </li>
              <li>
                <strong className="text-slate-800">Payroll and financial information:</strong> salary and compensation,
                earnings, deductions, tax and statutory calculations, payslips, account-holder name, bank name, account
                number, IFSC code, branch, and related salary-payment details.
              </li>
              <li>
                <strong className="text-slate-800">Files and communications:</strong> documents, photographs, forms,
                notifications, and information provided to HR through Connect HR.
              </li>
              <li>
                <strong className="text-slate-800">Security and device information:</strong> authentication tokens,
                login times, browser or user-agent information, push-notification subscription details, application
                version, and security or diagnostic records needed to operate and protect the service.
              </li>
            </ul>
            <p>
              Information may be provided directly by you, entered by authorized HR or administrative users, generated
              through your use of Connect HR, or received from an authorized employment workflow connected to your
              organization.
            </p>
          </Section>

          <Section id="use" title="How we use information">
            <p>We use information as necessary to provide and support Connect HR, including to:</p>
            <ul className="list-disc space-y-2 pl-6 marker:text-[#0B72E7]">
              <li>authenticate users and enforce role-based access;</li>
              <li>maintain employee profiles, onboarding, attendance, leave, holiday, and offboarding records;</li>
              <li>validate attendance or permitted login location when your organization enables that feature;</li>
              <li>administer compensation, payroll, statutory deductions, banking information, and payslips;</li>
              <li>store and deliver employee documents and workplace notifications;</li>
              <li>provide customer support, diagnose problems, maintain service reliability, and prevent misuse;</li>
              <li>comply with employment, tax, accounting, security, and other applicable legal obligations; and</li>
              <li>improve application functionality and user experience using operational feedback.</li>
            </ul>
            <p>We do not use Connect HR information for third-party advertising, and we do not sell personal information.</p>
          </Section>

          <Section id="sharing" title="How information is disclosed">
            <p>Information may be made available only as needed to:</p>
            <ul className="list-disc space-y-3 pl-6 marker:text-[#0B72E7]">
              <li>
                <strong className="text-slate-800">Your organization:</strong> authorized HR personnel,
                administrators, managers, payroll personnel, and other authorized staff according to their roles and
                employment responsibilities.
              </li>
              <li>
                <strong className="text-slate-800">Service providers:</strong> infrastructure, cloud hosting, database,
                file-storage, email-delivery, browser or push-notification, monitoring, and technical-support providers
                that process information to operate Connect HR for us.
              </li>
              <li>
                <strong className="text-slate-800">Authorities and professional advisers:</strong> where disclosure is
                required by applicable law, a lawful request, legal process, workplace investigation, or to protect the
                rights, safety, and security of users, organizations, or the service.
              </li>
              <li>
                <strong className="text-slate-800">Business successors:</strong> as part of a merger, acquisition,
                restructuring, financing, or transfer of the relevant business, subject to appropriate confidentiality
                and legal safeguards.
              </li>
            </ul>
            <p>We require service providers to handle information only for authorized service purposes and with suitable safeguards.</p>
          </Section>

          <Section id="choices" title="Device permissions, cookies, and your choices">
            <p>
              Connect HR may request location access when you sign in or record attendance and camera access when an
              attendance photograph or profile image is required. Location and camera access occur only after a user
              action and device permission. You can deny or revoke these permissions in Android or browser settings,
              although a feature required by your employer&apos;s attendance policy may then be unavailable.
            </p>
            <p>
              The application uses authentication cookies, tokens, local storage, and similar essential technologies to
              keep you signed in, remember application state, deliver updates, and protect the service. Connect HR does
              not use advertising cookies.
            </p>
            <p>
              Push notifications are optional. You can disable them through Connect HR, your browser, or Android system
              settings. You may review and update supported profile fields in the application or ask your organization&apos;s
              HR administrator to correct inaccurate information.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use administrative, technical, and organizational safeguards designed for the sensitivity of HR data.
              These include encrypted HTTPS transmission, password hashing, access controls, role-based authorization,
              session revocation, restricted administrative functions, and service monitoring. No internet transmission
              or storage system can be guaranteed completely secure, so users should protect their credentials and
              report suspected unauthorized access promptly.
            </p>
          </Section>

          <Section id="retention" title="Retention, account closure, and deletion">
            <p>
              Employee accounts are normally created and administered by an employer or authorized HR administrator;
              Connect HR does not provide public self-registration. We retain information for the period needed to
              provide the service to the organization and to meet legitimate employment, payroll, tax, accounting,
              security, dispute-resolution, and legal requirements. Retention periods may therefore differ by record
              type and by the organization responsible for the employment record.
            </p>
            <p>
              Offboarding or disabling login access does not automatically erase employment records. When an authorized
              deletion request is approved, credentials and active access are removed and information is deleted or
              de-identified where appropriate. Certain payroll, attendance, statutory, transaction, audit, or employment
              records may be retained when the employer or applicable law requires them. Retained records are restricted
              to the permitted retention purpose and removed or de-identified when that purpose ends.
            </p>
            <div id="data-deletion" className="scroll-mt-24 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <h3 className="font-[Manrope] text-base font-extrabold text-slate-900">Request access, correction, or deletion</h3>
              <p className="mt-2">
                Contact your organization&apos;s HR administrator first, or email{" "}
                <a className="font-bold text-[#086B55] underline" href="mailto:info@luxmorai.com?subject=Connect%20HR%20privacy%20request">
                  info@luxmorai.com
                </a>{" "}
                with the subject <strong>Connect HR privacy request</strong>. Include your name, organization, employee ID,
                and the type of request. Do not send your password, OTP, Aadhaar copy, bank details, or other sensitive
                documents by email. We may verify your identity and employment relationship before acting, and we will
                coordinate with the responsible employer where necessary.
              </p>
            </div>
          </Section>

          <Section title="International processing and children">
            <p>
              Service providers may process information in locations where they or their infrastructure operate, subject
              to contractual and legal safeguards appropriate to the service. Connect HR is a workplace application for
              authorized personnel and is not directed to children.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy when Connect HR features, data practices, providers, or legal requirements change.
              The latest version will be posted on this page with a revised update date. Material changes may also be
              communicated through the application or the responsible organization.
            </p>
          </Section>

          <Section id="contact" title="Contact us">
            <p>
              For privacy questions or requests concerning Connect HR, contact:
            </p>
            <address className="not-italic">
              <strong className="text-slate-900">Luxmorai Technologies Private Limited</strong>
              <br />
              Email:{" "}
              <a className="font-bold text-[#0B72E7] underline" href="mailto:info@luxmorai.com">
                info@luxmorai.com
              </a>
              <br />
              Application: Connect HR
            </address>
          </Section>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-500">© 2026 Luxmorai Technologies Private Limited</p>
            <Link href="/login" className="font-bold text-[#0B72E7] hover:text-[#0755AD]">
              Return to Connect HR sign in
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}
