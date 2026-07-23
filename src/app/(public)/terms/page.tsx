export default function TermsPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-[#6b7280] text-sm mb-10">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="prose prose-invert max-w-none space-y-8 text-[#c4c2d4]">
          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">1. Acceptance of Terms</h2>
            <p className="text-sm leading-relaxed">
              By accessing or using Honey Bunny (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">2. Age Requirement</h2>
            <p className="text-sm leading-relaxed">
              You must be at least 18 years of age to use Honey Bunny. By creating an account, you confirm that you are 18 or older. We reserve the right to terminate accounts where age misrepresentation is discovered.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">3. Nature of the Service</h2>
            <p className="text-sm leading-relaxed">
              Honey Bunny provides AI-generated companion characters for entertainment and companionship purposes. All companions are entirely fictional AI characters. No real human relationships are implied or created through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">4. Prohibited Content</h2>
            <p className="text-sm leading-relaxed mb-3">
              The following content is strictly prohibited on our platform:
            </p>
            <ul className="text-sm space-y-1.5 list-none">
              {[
                "Any content that depicts, implies, or suggests minors in sexual contexts",
                "Non-consensual sexual content",
                "Content involving abuse, coercion, or exploitation",
                "Incest-related sexual content",
                "CSAM or content adjacent to CSAM",
                "Sexual content involving real persons without clear consent indicators",
                "Attempts to use ambiguous age descriptors to circumvent safety measures",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 text-xs">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">5. Credits and Billing</h2>
            <p className="text-sm leading-relaxed">
              Credits are a virtual currency used within the Service. Purchased credits are non-refundable except as required by applicable law. Subscription credits reset at each billing period and do not roll over unless otherwise stated. We reserve the right to modify credit pricing with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">6. Account Termination</h2>
            <p className="text-sm leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these Terms of Service without prior notice. Violations of prohibited content policies may result in immediate termination and reporting to appropriate authorities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">7. Disclaimers</h2>
            <p className="text-sm leading-relaxed">
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. AI companions are not therapists, counselors, or replacements for human relationships. If you are experiencing a mental health crisis, please contact a qualified professional.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-3">8. Contact</h2>
            <p className="text-sm leading-relaxed">
              For questions about these Terms, contact us at{" "}
              <a href="mailto:legal@amorify.app" className="text-purple-400 hover:underline">
                legal@amorify.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
