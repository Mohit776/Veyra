"use client";

import { ChangeEvent, DragEvent, FormEvent, useRef, useState } from "react";

type CandidateResult = {
  filename: string;
  status: "success" | "error" | "skipped";
  score?: number;
  reason?: string;
  message?: string;
  candidate_id?: string;
  email?: string | null;
};

type UploadResponse = {
  job_id: string;
  total: number;
  processed: number;
  results: CandidateResult[];
};

type EmailStatus = {
  type: "success" | "error";
  message: string;
};

type ApiError = {
  detail?: string;
  error?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function UploadPage() {
  const [jobDescription, setJobDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (selectedFiles: File[]) => {
    const pdfFiles = selectedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((currentFiles) => [...currentFiles, ...pdfFiles]);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files?.length) {
      addFiles(Array.from(event.dataTransfer.files));
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      addFiles(Array.from(event.target.files));
      event.target.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles((currentFiles) =>
      currentFiles.filter((_, fileIndex) => fileIndex !== index),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!jobDescription.trim() || files.length === 0) return;

    setIsLoading(true);
    setResponse(null);
    setError(null);
    setEmailStatus(null);
    setProgressStatus("Preparing candidate analysis...");

    try {
      const jobId = crypto.randomUUID();
      const allResults: CandidateResult[] = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setProgressStatus(
          `Analyzing ${index + 1} of ${files.length}: ${file.name}`,
        );

        const formData = new FormData();
        formData.append("job_description", jobDescription);
        formData.append("job_id", jobId);
        formData.append("files", file);

        const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const apiError = (await uploadResponse
            .json()
            .catch(() => ({}))) as ApiError;
          throw new Error(
            apiError.detail ||
              apiError.error ||
              `Server error: ${uploadResponse.status}`,
          );
        }

        const data = (await uploadResponse.json()) as UploadResponse;
        if (data.results) {
          allResults.push(...data.results);
        }
      }

      allResults.sort((a, b) => {
        if (a.score === undefined && b.score === undefined) return 0;
        if (a.score === undefined) return 1;
        if (b.score === undefined) return -1;
        return b.score - a.score;
      });

      setResponse({
        job_id: jobId,
        total: files.length,
        processed: allResults.filter((result) => result.status === "success")
          .length,
        results: allResults,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsLoading(false);
      setProgressStatus(null);
    }
  };

  const handleSendEmails = async () => {
    if (!response) return;

    const topCandidates = response.results.filter(
      (result) => result.status === "success" && (result.score ?? 0) >= 7,
    );

    if (topCandidates.length === 0) {
      setEmailStatus({
        type: "error",
        message: "No candidates with score 7 or higher were found.",
      });
      return;
    }

    setIsSendingEmails(true);
    setEmailStatus(null);

    try {
      const emailResponse = await fetch("/api/send-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: topCandidates }),
      });

      const data = (await emailResponse.json().catch(() => ({}))) as ApiError;
      if (!emailResponse.ok) {
        throw new Error(data.error || "Failed to send emails.");
      }

      setEmailStatus({
        type: "success",
        message: "Emails sent to top candidates successfully.",
      });
    } catch (err: unknown) {
      setEmailStatus({
        type: "error",
        message: err instanceof Error ? err.message : "An error occurred.",
      });
    } finally {
      setIsSendingEmails(false);
    }
  };

  const getScoreStyles = (score: number) => {
    if (score >= 8) {
      return {
        badge: "border-[#2f6654]/25 bg-[#edf5ef] text-[#214f40]",
        value: "text-[#2f6654]",
      };
    }

    if (score >= 5) {
      return {
        badge: "border-[#c58a2a]/25 bg-[#fff7e7] text-[#8a5a13]",
        value: "text-[#9b6a1a]",
      };
    }

    return {
      badge: "border-[#b7472a]/25 bg-[#fff1ec] text-[#8f2f23]",
      value: "text-[#b7472a]",
    };
  };

  const successfulResults =
    response?.results.filter((result) => result.status === "success") ?? [];
  const averageScore =
    successfulResults.length > 0
      ? (
          successfulResults.reduce(
            (total, result) => total + (result.score ?? 0),
            0,
          ) / successfulResults.length
        ).toFixed(1)
      : "-";

  return (
    <main className="min-h-screen bg-[#f6f3ed] px-4 py-6 text-[#171717] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-[#d8d2c6] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7a6f60]">
              Resume intelligence
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#151515] sm:text-4xl">
              Candidate shortlisting
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f564a]">
              Add the role brief, upload candidate resumes, and let the matching
              model score fit before you contact the strongest applicants.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#6b6256] sm:min-w-[420px]">
            <div className="rounded-lg border border-[#d8d2c6] bg-white px-4 py-3">
              <p className="text-2xl font-semibold text-[#151515]">
                {files.length}
              </p>
              Files
            </div>
            <div className="rounded-lg border border-[#d8d2c6] bg-white px-4 py-3">
              <p className="text-2xl font-semibold text-[#151515]">
                {response?.processed ?? 0}
              </p>
              Scored
            </div>
            <div className="rounded-lg border border-[#d8d2c6] bg-white px-4 py-3">
              <p className="text-2xl font-semibold text-[#151515]">
                {averageScore}
              </p>
              Avg score
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]"
        >
          <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#151515]">
                  Role brief
                </h2>
                <p className="mt-1 text-sm text-[#6b6256]">
                  Paste the job description used for scoring.
                </p>
              </div>
              <span className="rounded-md bg-[#edf5ef] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6654]">
                Required
              </span>
            </div>

            <textarea
              id="jobDescription"
              rows={17}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Paste responsibilities, must-have skills, seniority, and hiring signals..."
              className="mt-5 min-h-[360px] w-full resize-y rounded-lg border border-[#d8d2c6] bg-[#fffdfa] px-4 py-3 text-sm leading-6 text-[#25221d] outline-none transition focus:border-[#2f6654] focus:ring-2 focus:ring-[#2f6654]/15"
              required
            />
          </section>

          <section className="flex flex-col rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-[#151515]">
                Resume queue
              </h2>
              <p className="mt-1 text-sm text-[#6b6256]">
                Upload PDF resumes for this role.
              </p>
            </div>

            <div
              className={`mt-5 grid min-h-56 cursor-pointer place-items-center rounded-lg border border-dashed px-6 py-8 text-center transition ${
                isDragging
                  ? "border-[#2f6654] bg-[#edf5ef]"
                  : "border-[#cfc6b8] bg-[#faf8f3] hover:border-[#2f6654]/70"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-lg bg-[#22332e] text-white">
                  <svg
                    className="size-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M12 16V4m0 0-4 4m4-4 4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
                    />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-semibold text-[#25221d]">
                  Drop PDFs here or click to browse
                </p>
                <p className="mt-1 text-xs text-[#7a6f60]">
                  Multiple files are supported.
                </p>
              </div>
            </div>

            <div className="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
              {files.length === 0 ? (
                <div className="rounded-lg border border-[#e5ded2] bg-[#fffdfa] p-4 text-sm text-[#7a6f60]">
                  No resumes added yet.
                </div>
              ) : (
                files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#e5ded2] bg-[#fffdfa] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#25221d]">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-[#7a6f60]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      title="Remove resume"
                      className="grid size-9 shrink-0 place-items-center rounded-md text-[#7a6f60] transition hover:bg-[#fff1ec] hover:text-[#b7472a]"
                    >
                      <svg
                        className="size-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || files.length === 0 || !jobDescription.trim()}
              className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#b7472a] px-5 text-sm font-semibold text-white transition hover:bg-[#96381f] disabled:cursor-not-allowed disabled:bg-[#cbbfb1]"
            >
              {isLoading ? (
                <>
                  <svg
                    className="size-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 0 1 8-8v8H4z"
                    />
                  </svg>
                  Analyzing
                </>
              ) : (
                <>
                  Analyze candidates
                  <svg
                    className="size-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M5 12h14m-6-6 6 6-6 6"
                    />
                  </svg>
                </>
              )}
            </button>

            {progressStatus && (
              <p className="mt-3 rounded-md bg-[#faf8f3] px-3 py-2 text-xs font-medium text-[#5f564a]">
                {progressStatus}
              </p>
            )}
          </section>
        </form>

        {error && (
          <div className="rounded-lg border border-[#e0a39b] bg-[#fff4f2] px-4 py-3 text-sm text-[#8f2f23]">
            <span className="font-semibold">Upload failed: </span>
            {error}
          </div>
        )}

        {response && (
          <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-[#e5ded2] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#151515]">
                  Ranked candidates
                </h2>
                <p className="mt-1 text-sm text-[#6b6256]">
                  {response.processed} of {response.total} files processed for
                  job {response.job_id.slice(0, 8)}.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendEmails}
                disabled={isSendingEmails}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#22332e] px-4 text-sm font-semibold text-white transition hover:bg-[#16221e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingEmails ? "Sending emails..." : "Email top candidates"}
              </button>
            </div>

            {emailStatus && (
              <div
                className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                  emailStatus.type === "success"
                    ? "border-[#2f6654]/25 bg-[#edf5ef] text-[#214f40]"
                    : "border-[#e0a39b] bg-[#fff4f2] text-[#8f2f23]"
                }`}
              >
                {emailStatus.message}
              </div>
            )}

            <div className="mt-5 divide-y divide-[#e5ded2] overflow-hidden rounded-lg border border-[#e5ded2]">
              {response.results.map((result, index) => {
                const score = result.score ?? 0;
                const scoreStyles = getScoreStyles(score);

                return (
                  <article
                    key={`${result.filename}-${index}`}
                    className="grid gap-4 bg-[#fffdfa] p-4 md:grid-cols-[minmax(0,1fr)_130px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-[#25221d]">
                          {result.filename}
                        </p>
                        <span
                          className={`rounded-md border px-2 py-1 text-xs font-semibold capitalize ${
                            result.status === "success"
                              ? scoreStyles.badge
                              : result.status === "skipped"
                                ? "border-[#c58a2a]/25 bg-[#fff7e7] text-[#8a5a13]"
                                : "border-[#e0a39b] bg-[#fff4f2] text-[#8f2f23]"
                          }`}
                        >
                          {result.status}
                        </span>
                      </div>

                      {result.message && (
                        <p className="mt-2 text-sm text-[#8f2f23]">
                          {result.message}
                        </p>
                      )}

                      {result.reason && (
                        <p className="mt-3 max-w-4xl text-sm leading-6 text-[#5f564a]">
                          {result.reason}
                        </p>
                      )}
                    </div>

                    {result.status === "success" && result.score !== undefined && (
                      <div className="flex items-center justify-start md:justify-end">
                        <div className="text-left md:text-right">
                          <p className={`text-3xl font-semibold ${scoreStyles.value}`}>
                            {result.score}
                            <span className="text-sm font-medium text-[#8a7f70]">
                              /10
                            </span>
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#7a6f60]">
                            Match score
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
