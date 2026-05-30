"use client";

import type { Mode } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircleIcon,
  ImageIcon,
  Loader2Icon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import { useState, useTransition } from "react";

import { createRunAction } from "@/app/studio/actions";
import { ImageDropzone } from "@/components/studio/image-dropzone";
import { ModeToggleField } from "@/components/studio/mode-toggle-field";
import { PromptField } from "@/components/studio/prompt-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function CreateRunForm() {
  const [productFile, setProductFile] = useState<File | null>(null);
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("automatic");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = Boolean(productFile) && prompt.trim().length > 0;

  function submit() {
    setError(null);
    if (!productFile) {
      setError("A product image is required.");
      return;
    }
    if (prompt.trim().length === 0) {
      setError("Add a prompt describing the ad.");
      return;
    }

    const fd = new FormData();
    fd.set("productImage", productFile);
    if (personFile) fd.set("personImage", personFile);
    fd.set("prompt", prompt.trim());
    fd.set("mode", mode);

    startTransition(async () => {
      const result = await createRunAction(fd);
      // On success the action redirects (throws), so we only get here on error.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <Card className="ring-glow overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Create a run</CardTitle>
        <CardDescription>
          Upload a product image, describe the ad, and choose how the pipeline
          runs.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageDropzone
            label="Product image"
            file={productFile}
            onFile={setProductFile}
            required
            hint="The hero of the ad"
          />
          <ImageDropzone
            label="Person image"
            file={personFile}
            onFile={setPersonFile}
            hint="Skip it — one will be generated"
          />
        </div>

        <PromptField value={prompt} onChange={setPrompt} />

        <ModeToggleField value={mode} onChange={setMode} />

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">
            Your selections
          </span>
          <div className="flex flex-wrap gap-2">
            <Badge variant={productFile ? "brand" : "outline"}>
              <ImageIcon className="size-3" />
              {productFile ? "Product added" : "No product"}
            </Badge>
            <Badge variant={personFile ? "secondary" : "outline"}>
              <UserIcon className="size-3" />
              {personFile ? "Person added" : "Person auto-generated"}
            </Badge>
            <Badge variant="secondary">
              <SparklesIcon className="size-3" />
              {mode === "automatic" ? "Automatic" : "Confirm every step"}
            </Badge>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-destructive flex items-center gap-2 text-sm"
            >
              <AlertCircleIcon className="size-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      <Separator />

      <CardFooter className="justify-end pt-0">
        <Button
          size="lg"
          variant="brand"
          onClick={submit}
          disabled={!canSubmit || pending}
        >
          {pending ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Starting run…
            </>
          ) : (
            <>
              <SparklesIcon className="size-4" />
              Generate ad video
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
