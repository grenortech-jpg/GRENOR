import { AlertCircle, CheckCircle2 } from "lucide-react";

export type FeedbackState = {
  error?: string;
  success?: string;
};

/** Mensagem de erro ou sucesso de um formulario. */
export function FormFeedback({ state }: { state: FeedbackState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-md bg-positive/10 px-3 py-2 text-sm text-positive"
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {state.success}
      </p>
    );
  }

  return null;
}
