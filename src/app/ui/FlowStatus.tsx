import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { useTranslation } from "react-i18next";

export type FlowStepState = "pending" | "active" | "done";

export interface FlowStep {
  key: string;
  label: string;
  state: FlowStepState;
}

interface Props {
  steps: FlowStep[];
}

export function FlowStatus({ steps }: Props) {
  const { t } = useTranslation();

  return (
    <section className="flowStatus" aria-label={t("flow.label")}>
      {steps.map((step) => {
        const Icon =
          step.state === "done" ? CheckCircle2 : step.state === "active" ? CircleDot : Circle;
        return (
          <div className={`flowStep ${step.state}`} key={step.key}>
            <Icon size={18} aria-hidden="true" />
            <span>{step.label}</span>
          </div>
        );
      })}
    </section>
  );
}
