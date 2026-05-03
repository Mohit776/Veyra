"use client";

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';

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

export default function UploadPage() {
  const [jobDescription, setJobDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobDescription.trim()) return;
    if (files.length === 0) return;

    setIsLoading(true);
    setResponse(null);
    setError(null);
    setProgressStatus("Preparing to analyze...");

    try {
      const jobId = crypto.randomUUID();
      const allResults: CandidateResult[] = [];

      for (let i = 0; i < files.length; i++) {
        setProgressStatus(`Analyzing candidate ${i + 1} of ${files.length} (${files[i].name})...`);
        const formData = new FormData();
        formData.append("job_description", jobDescription);
        formData.append("job_id", jobId);
        formData.append("files", files[i]);

        const res = await fetch("http://localhost:8000/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error: ${res.status}`);
        }

        const data: UploadResponse = await res.json();
        if (data.results) {
          allResults.push(...data.results);
        }
      }

      // Sort results after all files are analyzed
      allResults.sort((a, b) => {
        if (a.score === undefined && b.score === undefined) return 0;
        if (a.score === undefined) return 1;
        if (b.score === undefined) return -1;
        return b.score - a.score;
      });

      setResponse({
        job_id: jobId,
        total: files.length,
        processed: allResults.filter(r => r.status === 'success').length,
        results: allResults
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
      setProgressStatus(null);
    }
  };

  const handleSendEmails = async () => {
    if (!response || !response.results) return;
    
    // Get top candidates (e.g. score >= 7)
    const topCandidates = response.results.filter(r => r.status === "success" && (r.score ?? 0) >= 7);
    
    if (topCandidates.length === 0) {
      setEmailStatus({ type: 'error', message: "No top candidates found with score >= 7." });
      return;
    }

    setIsSendingEmails(true);
    setEmailStatus(null);
    
    try {
      const res = await fetch("/api/send-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: topCandidates })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send emails");
      
      setEmailStatus({ type: 'success', message: "Emails sent to top candidates successfully!" });
    } catch (err: any) {
      setEmailStatus({ type: 'error', message: err.message || "An error occurred." });
    } finally {
      setIsSendingEmails(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-emerald-400";
    if (score >= 5) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 8) return "bg-emerald-500/10 border-emerald-500/30";
    if (score >= 5) return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-red-500/10 border-red-500/30";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/20 blur-[120px]" />
      </div>

      <div className="w-full max-w-4xl relative z-10 space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            AI Resume Matcher
          </h1>
          <p className="text-lg text-gray-400">
            Upload a job description and resumes — our AI scores every candidate instantly.
          </p>
        </div>

        {/* Upload Form */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Job Description */}
            <div className="space-y-3">
              <label htmlFor="jobDescription" className="block text-sm font-medium text-gray-300 ml-1">
                Job Description
              </label>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur opacity-20 group-focus-within:opacity-50 transition duration-500" />
                <textarea
                  id="jobDescription"
                  rows={6}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="relative block w-full rounded-xl border-0 bg-[#12121a]/90 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm p-4 resize-y outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* Resume Upload */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300 ml-1">
                Candidate Resumes
              </label>

              <div
                className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 ${
                  isDragging
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-white/20 bg-black/20 hover:border-white/40 hover:bg-white/5"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
                <div
                  className="py-12 px-6 flex flex-col items-center justify-center text-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={`p-4 rounded-full mb-4 transition-colors ${isDragging ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-200 mb-1">Click to upload or drag & drop</h3>
                  <p className="text-sm text-gray-400">PDF files only (multiple allowed)</p>
                </div>
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg shrink-0">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium text-gray-200 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || files.length === 0}
                className="group relative w-full flex justify-center items-center gap-3 py-4 px-4 border border-transparent text-lg font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0f] transition-all duration-200 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {progressStatus || "Analyzing Candidates…"}
                  </>
                ) : (
                  <>
                    <span>Analyze Candidates</span>
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-2xl px-6 py-4 flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p className="font-semibold">Upload failed</p>
              <p className="text-sm mt-1 text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {response && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                  Results
                </h2>
                <div className="flex gap-4 text-sm">
                  <span className="px-3 py-1 rounded-full bg-white/10 text-gray-300">
                    ✅ {response.processed} processed
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-gray-400 font-mono text-xs">
                    Job ID: {response.job_id.slice(0, 8)}…
                  </span>
                </div>
              </div>
              <button
                onClick={handleSendEmails}
                disabled={isSendingEmails}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingEmails ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email Top Candidates
                  </>
                )}
              </button>
            </div>

            {emailStatus && (
              <div className={`rounded-2xl px-6 py-4 flex items-start gap-3 ${emailStatus.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300' : 'bg-red-500/10 border border-red-500/40 text-red-300'}`}>
                <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {emailStatus.type === 'success' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  )}
                </svg>
                <p className="text-sm mt-0.5">{emailStatus.message}</p>
              </div>
            )}

            <div className="space-y-4">
              {response.results.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 transition-all ${
                    r.status === "success"
                      ? getScoreBg(r.score ?? 0)
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/5 rounded-lg">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-100">{r.filename}</p>
                        {r.status === "error" && (
                          <p className="text-xs text-red-400 mt-1">{r.message}</p>
                        )}
                        {r.status === "skipped" && (
                          <p className="text-xs text-yellow-400 mt-1">{r.message}</p>
                        )}
                      </div>
                    </div>
                    {r.status === "success" && r.score !== undefined && (
                      <div className="text-right shrink-0">
                        <span className={`text-3xl font-black ${getScoreColor(r.score)}`}>
                          {r.score}
                        </span>
                        <span className="text-gray-500 text-sm">/10</span>
                      </div>
                    )}
                  </div>

                  {r.reason && (
                    <p className="mt-4 text-sm text-gray-300 leading-relaxed border-t border-white/10 pt-4">
                      {r.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 10px; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        `
      }} />
    </div>
  );
}
