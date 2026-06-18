"use client";

import React, { useState } from "react";

type TermsProps = {
  onAccept: () => void;
  onDecline?: () => void;
};

export default function Terms({ onAccept, onDecline }: TermsProps) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f3ed] p-4 text-[#171717] sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[#d8d2c6] bg-white shadow-2xl">
        {/* Header */}
        <div className="bg-[#22332e] px-8 py-10 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a8b5b0]">
            Veyra Interview Platform
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            Candidate Guidelines & Terms
          </h1>
          <p className="mt-4 text-[#cfd7d3] leading-relaxed max-w-2xl">
            Please review the following instructions and terms carefully before joining your automated interview session.
          </p>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-8 py-8 space-y-10">
          {/* Section: How to Join */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-8 place-items-center rounded-lg bg-[#2f6654]/10 text-[#2f6654]">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>
              <h2 className="text-xl font-bold">How to Join the Interview</h2>
            </div>
            <ul className="grid gap-3 text-sm text-[#5f564a]">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 grid size-5 place-items-center rounded-full bg-[#ece5da] text-[10px] font-bold">1</span>
                <span>Ensure you are in a **quiet, well-lit environment** with a stable internet connection.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 grid size-5 place-items-center rounded-full bg-[#ece5da] text-[10px] font-bold">2</span>
                <span>The interview is text-based and powered by AI. Read each question carefully before responding.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 grid size-5 place-items-center rounded-full bg-[#ece5da] text-[10px] font-bold">3</span>
                <span>You will have a total of **6 questions** to answer. Your progress will be tracked in real-time.</span>
              </li>
            </ul>
          </section>

          {/* Section: Prohibitions */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-8 place-items-center rounded-lg bg-[#b7472a]/10 text-[#b7472a]">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#b7472a]">Interview Integrity (What NOT to do)</h2>
            </div>
            <div className="grid gap-4 rounded-xl border border-[#f5e3e0] bg-[#fff9f8] p-5 text-sm text-[#8f2f23]">
              <div className="flex items-start gap-3">
                <svg className="size-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p>**Do not use external AI assistance** (ChatGPT, Gemini, etc.) to generate your responses.</p>
              </div>
              <div className="flex items-start gap-3">
                <svg className="size-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p>**Avoid refreshing the page** or navigating away once the interview has started.</p>
              </div>
              <div className="flex items-start gap-3">
                <svg className="size-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p>**Do not copy-paste** content from other sources. We use plagiarism detection.</p>
              </div>
            </div>
          </section>

          {/* Section: Terms & Privacy */}
          <section>
            <h2 className="mb-4 text-xl font-bold">Terms & Conditions</h2>
            <div className="space-y-4 text-sm text-[#6b6256] leading-relaxed">
              <p>
                By proceeding, you consent to the collection and processing of your interview responses by Veyra's AI models. Your data is used solely for candidate assessment and will not be shared with third parties without your consent.
              </p>
              <p>
                The assessment generated by the AI is indicative and serves as a tool for hiring managers. Final decisions are made by humans.
              </p>
            </div>
          </section>
        </div>

        {/* Footer with Accept Button */}
        <div className="border-t border-[#ece5da] bg-[#faf8f3] px-8 py-8">
          <label className="flex items-center gap-3 cursor-pointer group mb-6">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="size-5 rounded border-[#d8d2c6] text-[#2f6654] focus:ring-[#2f6654]"
            />
            <span className="text-sm font-medium text-[#4b443b] group-hover:text-[#151515] transition-colors">
              I have read and understand the instructions and agree to the terms.
            </span>
          </label>

          <div className="flex gap-4">
            {onDecline && (
              <button
                onClick={onDecline}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#d8d2c6] bg-white py-4 text-sm font-bold text-[#5f564a] transition-all hover:bg-[#f6f3ed]"
              >
                Decline
              </button>
            )}
            <button
              onClick={onAccept}
              disabled={!agreed}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2f6654] py-4 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#255243] hover:shadow-xl disabled:cursor-not-allowed disabled:bg-[#cbbfb1] disabled:shadow-none"
            >
              Enter Interview Room
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}