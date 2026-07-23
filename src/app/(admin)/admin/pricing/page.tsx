import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingRuleToggle } from "@/components/admin/PricingRuleToggle";
import { DollarSign } from "lucide-react";

export const metadata = { title: "Pricing Rules — Admin" };

export default async function AdminPricingPage() {
  const rules = await prisma.pricingRule.findMany({
    orderBy: [{ actionType: "asc" }, { modelSlug: "asc" }],
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f0ff] flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-400" />
          Pricing Rules
        </h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          {rules.length} pricing rules configured
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Pricing Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-[#6b7280] text-center py-6">
              No pricing rules configured. Run seed to initialize default rules.
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between py-3 border-b border-[#1a1a26] last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-[#f1f0ff]">{rule.name}</p>
                    <p className="text-xs text-[#6b7280]">
                      {rule.actionType}
                      {rule.modelSlug ? ` · ${rule.modelSlug}` : " (all models)"}
                      {rule.planSlug ? ` · plan:${rule.planSlug}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-amber-400">
                      {rule.creditCost} credits
                    </span>
                    <Badge variant={rule.isEnabled ? "success" : "secondary"}>
                      {rule.isEnabled ? "Active" : "Inactive"}
                    </Badge>
                    <PricingRuleToggle ruleId={rule.id} isEnabled={rule.isEnabled} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
