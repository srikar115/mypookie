export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-[#6b7280] text-sm mb-10">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="space-y-8 text-[#c4c2d4]">
          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">1. Information We Collect</h2>
            <p className="text-sm leading-relaxed mb-3">We collect information you provide directly:</p>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>Account information (email, name)</li>
              <li>Age confirmation and policy acceptance timestamps</li>
              <li>IP address at signup for fraud prevention</li>
              <li>Companion configurations you create</li>
              <li>Chat messages and conversation history</li>
              <li>Payment information (processed securely by Stripe, not stored by us)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">2. How We Use Your Information</h2>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>To provide and improve the Service</li>
              <li>To personalize your companion experience</li>
              <li>To process payments and manage credits</li>
              <li>To enforce our Terms of Service and Content Policy</li>
              <li>To comply with legal obligations</li>
              <li>To detect and prevent fraud and abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">3. Data Sharing</h2>
            <p className="text-sm leading-relaxed">
              We do not sell your personal data. We may share data with service providers who help us operate the platform (AI providers, payment processors, hosting). These providers are contractually bound to protect your data. We will disclose data when required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">4. Data Retention</h2>
            <p className="text-sm leading-relaxed">
              We retain your account data as long as your account is active. Conversation history may be retained to provide memory features. You may request deletion of your account and associated data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">5. Security</h2>
            <p className="text-sm leading-relaxed">
              We implement industry-standard security measures to protect your data. Passwords are hashed using bcrypt. Database connections use encrypted channels. We conduct regular security reviews.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">6. Your Rights</h2>
            <p className="text-sm leading-relaxed">
              Depending on your location, you may have rights to access, correct, or delete your personal data. Contact us at{" "}
              <a href="mailto:privacy@amorify.app" className="text-purple-400 hover:underline">
                privacy@amorify.app
              </a>{" "}
              to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">7. Cookies</h2>
            <p className="text-sm leading-relaxed">
              We use essential cookies for authentication and session management. We do not use third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">8. Contact</h2>
            <p className="text-sm leading-relaxed">
              For privacy inquiries:{" "}
              <a href="mailto:privacy@amorify.app" className="text-purple-400 hover:underline">
                privacy@amorify.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
