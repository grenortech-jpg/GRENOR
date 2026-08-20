"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Area de arrastar-e-soltar. Mantem um <input type="file"> real por baixo:
 * o formulario continua funcionando por teclado e sem JavaScript.
 */
export function Dropzone({ name = "file" }: { name?: string }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);

        const dropped = event.dataTransfer.files?.[0];
        if (!dropped || !inputRef.current) return;

        const transfer = new DataTransfer();
        transfer.items.add(dropped);
        inputRef.current.files = transfer.files;
        setFileName(dropped.name);
      }}
      className={cn(
        "rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
        dragging ? "border-brand bg-accent/60" : "border-border",
      )}
    >
      {fileName ? (
        <FileSpreadsheet
          className="mx-auto size-8 text-brand"
          aria-hidden="true"
        />
      ) : (
        <Upload className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      )}

      <p className="mt-4 text-sm font-medium">
        {fileName ?? "Arraste o extrato aqui"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        OFX, CSV ou XLSX · até 10 MB
      </p>

      <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept=".ofx,.csv,.txt,.xlsx,.xlsm"
          required
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
        {fileName ? "Trocar arquivo" : "Escolher arquivo"}
      </label>
    </div>
  );
}
