import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const ONBOARDING_STEPS = [
  { key: "workspace", label: "Escritório" },
  { key: "empresa", label: "Empresa" },
  { key: "conta", label: "Conta" },
  { key: "pronto", label: "Pronto" },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"];

export function isOnboardingStep(value: string): value is OnboardingStep {
  return ONBOARDING_STEPS.some((step) => step.key === value);
}

/** Trilha do wizard. Passos concluidos ficam marcados, o atual em destaque. */
export function OnboardingSteps({ current }: { current: OnboardingStep }) {
  const currentIndex = ONBOARDING_STEPS.findIndex(
    (step) => step.key === current,
  );

  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Progresso">
      {ONBOARDING_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                done && "bg-brand text-brand-foreground",
                active && "bg-gold text-gold-foreground",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>

            <span
              className={cn(
                "hidden text-sm sm:inline",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>

            {index < ONBOARDING_STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  done ? "bg-brand" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
