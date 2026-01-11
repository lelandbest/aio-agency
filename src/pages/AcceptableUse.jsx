import React from 'react';

export default function AcceptableUsePage() {
  return (
    <div className="min-h-screen bg-[#0F0F11] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Acceptable Use Policy</h1>
        
        <div className="space-y-6 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Overview</h2>
            <p>
              This Acceptable Use Policy ("Policy") applies to all users of AIO Agency ("Service"). By accessing and using the Service, 
              you agree to comply with this Policy. Violation of this Policy may result in suspension or termination of your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Prohibited Uses</h2>
            <p>
              You agree not to use the Service for any of the following purposes:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Any illegal activity or purpose</li>
              <li>Infringement of any intellectual property rights of others</li>
              <li>Harassment, abuse, or threatening behavior towards any person</li>
              <li>Sending unsolicited commercial communications or spam</li>
              <li>Uploading or transmitting viruses or any other malicious code</li>
              <li>Attempting to gain unauthorized access to systems or networks</li>
              <li>Disrupting the normal operation of the Service</li>
              <li>Reverse engineering or attempting to derive the source code of our Service</li>
              <li>Impersonating another person or entity</li>
              <li>Collecting or tracking personal information of others without consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. User Responsibilities</h2>
            <p>
              As a user of AIO Agency, you are responsible for:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Providing accurate and complete information when registering</li>
              <li>Complying with all applicable laws and regulations</li>
              <li>Not violating the rights of any third parties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Content Guidelines</h2>
            <p>
              Any content you upload or create on the Service must not:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Contain false or misleading information</li>
              <li>Be defamatory, obscene, or offensive</li>
              <li>Violate any third-party rights</li>
              <li>Contain malware or harmful code</li>
              <li>Infringe on copyrights or trademarks</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Enforcement</h2>
            <p>
              AIO Agency reserves the right to:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Monitor and investigate violations of this Policy</li>
              <li>Remove content that violates this Policy</li>
              <li>Suspend or terminate accounts of users violating this Policy</li>
              <li>Report violations to appropriate authorities when necessary</li>
              <li>Take legal action against users engaging in illegal activities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Modifications to This Policy</h2>
            <p>
              AIO Agency may modify this Policy at any time. Continued use of the Service following any changes constitutes your 
              acceptance of the modified Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Questions or Concerns</h2>
            <p>
              If you have any questions about this Acceptable Use Policy, please contact us at support@aioflow.com
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-[#27272A] text-sm text-gray-500">
            <p>Last Updated: January 2026</p>
          </div>
        </div>
      </div>
    </div>
  );
}
