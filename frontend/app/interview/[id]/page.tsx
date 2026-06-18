"use client";

import { CSSProperties, use, useEffect, useRef, useState } from "react";
import Terms from "./terms";
import { Mic, MicOff, Send, CheckCircle } from "lucide-react";

type PageProps = {
  params: Promise<{ id: string }>;
};

type MicState = "idle" | "requesting" | "ready" | "blocked";

type InterviewMessage = { role: string; content: string };

const GRACE_PERIOD_MS = 2000; // 2 seconds grace after Deepgram speech_final before auto-submit

export default function InterviewPage({ params }: PageProps) {
  const { id } = use(params);
  const [micState, setMicState] = useState<MicState>("idle");
  const [isStarted, setIsStarted] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [verificationError, setVerificationError] = useState("");

  const [history, setHistory] = useState<InterviewMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [graceCountdown, setGraceCountdown] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef(transcript);
  const interimTranscriptRef = useRef(interimTranscript);

  // Verify the interview link on mount
  useEffect(() => {
    const verifyLink = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/interview/${id}/verify`);
        if (!res.ok) {
          const data = await res.json();
          setVerificationError(data.detail || "Invalid or expired link.");
        }
      } catch (err) {
        setVerificationError("Failed to verify interview link.");
      } finally {
        setIsValidating(false);
      }
    };
    verifyLink();

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [id]);

  // Keep refs in sync so grace timer always reads fresh values (Issue #2 fix)
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  const requestMicPermission = async () => {
    setMicState("requesting");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      setMicState("ready");
    } catch {
      setMicState("blocked");
      setError("Microphone permission is needed to start.");
    }
  };

  const startVisualizer = async () => {
    if (!streamRef.current) return;

    const browserWindow = window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const AudioContextConstructor =
      window.AudioContext || browserWindow.webkitAudioContext;

    if (!AudioContextConstructor) {
      setError("Audio is not supported in this browser.");
      return;
    }

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(streamRef.current);

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    await audioContext.resume();
    setIsStarted(true);

    const samples = new Uint8Array(analyser.frequencyBinCount);
    let smoothedLevel = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);

      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / samples.length);
      const targetLevel = Math.min(1, rms * 5);
      smoothedLevel = smoothedLevel * 0.84 + targetLevel * 0.16;
      setLevel(smoothedLevel);
      frameRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const speakText = (text: string) => {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      // Cancel any queued or ongoing speech first
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // Timeout to prevent hanging if onend never fires (Issue #3 fix)
      const timeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        resolve();
      }, 15000);

      utterance.onend = () => { clearTimeout(timeout); resolve(); };
      utterance.onerror = () => { clearTimeout(timeout); resolve(); };

      setAssistantSpeaking(true);
      window.speechSynthesis.speak(utterance);
    });
  };

  const fetchNextQuestion = async (newHistory: InterviewMessage[]) => {
    try {
      setIsFetching(true);
      const res = await fetch(`http://localhost:8000/api/interview/${id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: newHistory }),
      });
      const data = await res.json();
      
      const replyText = data.reply || "I'm having trouble connecting.";
      
      const updatedHistory = [...newHistory, { role: "assistant", content: replyText }];
      setHistory(updatedHistory);
      
      if (data.finished) {
        setIsFinished(true);
        setFinalScore(data.score);
      }
      
      setIsFetching(false);
      await speakText(replyText);
      setAssistantSpeaking(false);
      
      if (!data.finished) {
        setTranscript("");
        setInterimTranscript("");
        startDeepgramListening();
      }
    } catch (err) {
      console.error("Failed to fetch next question", err);
      setIsFetching(false);
      setAssistantSpeaking(false);
    }
  };

  const submitAnswer = async () => {
    // Guard against duplicate submissions while LLM is responding (Issue #4 fix)
    if (isFetching) return;

    // Capture both final and interim transcript before stopping
    const fullTranscript = (transcriptRef.current + interimTranscriptRef.current).trim();
    stopDeepgramListening();
    clearGraceTimer();

    if (!fullTranscript) return;

    const newHistory = [...history, { role: "user", content: fullTranscript }];
    setHistory(newHistory);
    setTranscript("");
    setInterimTranscript("");
    await fetchNextQuestion(newHistory);
  };

  const clearGraceTimer = () => {
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    setGraceCountdown(null);
  };

  const startGraceTimer = () => {
    clearGraceTimer();
    const endTime = Date.now() + GRACE_PERIOD_MS;

    graceTimerRef.current = setInterval(() => {
      const currentTranscript = transcriptRef.current + interimTranscriptRef.current;
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      const hasContent = currentTranscript.trim().length > 0;

      if (hasContent && remaining > 0) {
        setGraceCountdown(remaining);
      } else {
        setGraceCountdown(null);
      }

      if (Date.now() >= endTime && hasContent) {
        clearGraceTimer();
        void submitAnswer();
      }
    }, 200);
  };

  const startDeepgramListening = () => {
    if (!streamRef.current) return;

    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProtocol}//localhost:8000/ws/transcribe/${id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      try {
        // Pick a supported MIME type
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";  // let the browser decide

        const recorderOptions: MediaRecorderOptions = {};
        if (mimeType) recorderOptions.mimeType = mimeType;

        const recorder = new MediaRecorder(streamRef.current!, recorderOptions);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            event.data.arrayBuffer().then((buffer) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(new Uint8Array(buffer));
              }
            });
          }
        };

        recorder.onerror = (e) => {
          console.error("MediaRecorder error:", e);
        };

        recorder.start(250);  // send chunks every 250ms
        setIsListening(true);
      } catch (e) {
        console.error("Failed to start MediaRecorder:", e);
        setError("Failed to start audio recording.");
        ws.close();
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "transcript") {
          const { transcript: text, is_final, speech_final } = message.data;
          
          if (is_final) {
            transcriptRef.current = (transcriptRef.current + " " + text).trim() + " ";
            interimTranscriptRef.current = "";
            setTranscript(transcriptRef.current);
            setInterimTranscript("");
          } else {
            interimTranscriptRef.current = text;
            setInterimTranscript(text);
          }

          const currentContent = (transcriptRef.current + interimTranscriptRef.current).trim();

          // Cancel grace timer if there's active speech (not final and has some text)
          if (!speech_final && text.trim().length > 0) {
            clearGraceTimer();
          }
          
          // Start grace timer when Deepgram signals speech is final
          if (speech_final && currentContent.length > 0) {
            startGraceTimer();
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
      setIsListening(false);
    };

    ws.onclose = () => {
      setIsListening(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  };

  const stopDeepgramListening = () => {
    clearGraceTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ action: "close" }));
      } catch {
        // ignore
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  };

  const handleStart = async () => {
    if (micState !== "ready") {
      await requestMicPermission();
      // wait for user to click again after permission is granted
      return;
    }
    await startVisualizer();
    await fetchNextQuestion([]);
  };

  const buttonLabel =
    micState === "requesting"
      ? "Allowing..."
      : micState === "ready"
        ? "Start Interview"
        : "Enable microphone";

  // When assistant is speaking, make orb pulse more. When user is speaking, base it on mic level.
  const orbLevel = assistantSpeaking ? 0.6 + Math.sin(Date.now() / 200) * 0.2 : level;

  const ballStyle = {
    "--voice-level": orbLevel,
  } as CSSProperties;

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f3ed]">
        <p className="text-[#5f564a]">Validating interview link...</p>
      </div>
    );
  }

  if (verificationError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f3ed] p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-[#e6e2d8]">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-[#5f564a] mb-6">{verificationError}</p>
          <p className="text-sm text-[#8a7f70]">Please contact HR if you believe this is a mistake.</p>
        </div>
      </div>
    );
  }

  if (!hasAcceptedTerms) {
    return <Terms onAccept={() => setHasAcceptedTerms(true)} onDecline={() => setVerificationError("You must accept the terms to proceed with the interview.")} />;
  }

  if (isFinished) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f3ed] px-6 text-center">
        <div className="max-w-md bg-white p-10 rounded-3xl shadow-xl border border-[#e6e2d8]">
          <div className="mb-6 mx-auto grid size-20 place-items-center rounded-full bg-[#2f6654]/10 text-[#2f6654]">
            <CheckCircle className="size-10" />
          </div>
          <h1 className="text-3xl font-bold text-[#151515] mb-4">Interview Complete</h1>
          <p className="text-[#5f564a] mb-8 leading-relaxed">
            Thank you for your time. Your responses have been recorded and will be reviewed by our team.
            {finalScore !== null && <span className="block mt-4 font-semibold text-[#2f6654]">Your score: {finalScore}/100</span>}
          </p>
          <p className="text-sm text-[#8a7f70]">You may now close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <main
      aria-label={`Interview ${id}`}
      className="flex min-h-screen flex-col items-center justify-center bg-[#f6f3ed] px-6 text-[#171717] pb-32"
    >
      <div className="mb-12 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7a6f60]">
          AI Interview
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#151515] sm:text-5xl">
          {assistantSpeaking ? "Veyra is speaking..." : isListening ? "Listening — speak now" : "Speak when you are ready"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#5f564a] sm:text-base">
          {assistantSpeaking ? "Veyra is speaking. Please wait." : isListening ? "Your microphone is active. Speak your answer and it will appear below." : "Your voice drives the interview orb. It listens for speech energy and responds in real time."}
        </p>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-[#8a7f70]">
          Session {id}
        </p>
      </div>

      {!isStarted ? (
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleStart}
            disabled={micState === "requesting"}
            className="h-12 rounded-full bg-[#22332e] px-7 text-sm font-medium text-white transition hover:scale-[1.03] hover:bg-[#16221e] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {buttonLabel}
          </button>
          {error && <p className="text-sm text-[#8f2f23]">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center w-full max-w-3xl">
          <div
            className="relative grid size-72 place-items-center sm:size-96 transition-all"
            style={ballStyle}
          >
            <div className={`absolute size-full rounded-full blur-3xl transition-transform duration-200 [transform:scale(calc(0.72+var(--voice-level)*0.55))] ${assistantSpeaking ? 'bg-[#2f6654]/20' : 'bg-[#b7472a]/10'}`} />
            <div className="absolute size-52 animate-spin rounded-full border border-dashed border-[#d8d2c6] transition-transform duration-200 [animation-duration:18s] sm:size-64 [transform:scale(calc(1+var(--voice-level)*0.3))]" />
            <div className="absolute size-36 animate-spin rounded-full border border-[#2f6654]/25 transition-transform duration-200 [animation-direction:reverse] [animation-duration:12s] sm:size-44 [transform:scale(calc(1+var(--voice-level)*0.2))]" />
            <div className={`relative grid size-28 place-items-center overflow-hidden rounded-full shadow-[0_0_70px_rgba(183,71,42,0.28)] transition-colors duration-500 sm:size-36 [transform:scale(calc(1+var(--voice-level)*0.7))] ${assistantSpeaking ? 'bg-[#2f6654]' : 'bg-[#22332e]'}`}>
              <span className={`absolute -left-8 top-6 size-16 animate-pulse rounded-full blur-xl ${assistantSpeaking ? 'bg-[#438a73]/45' : 'bg-[#b7472a]/45'}`} />
              <span className="absolute bottom-3 right-4 size-10 animate-bounce rounded-full bg-[#f6f3ed]/18 blur-md [animation-duration:2.8s]" />
              <span className="absolute inset-4 animate-spin rounded-full border border-[#f6f3ed]/15 [animation-duration:7s]" />
              <span className="absolute size-2 rounded-full bg-[#f6f3ed]/80 shadow-[0_0_18px_rgba(246,243,237,0.7)]" />
            </div>
          </div>
          
          <div className="mt-12 w-full">
            {history.length > 0 && (
               <div className="mb-8 p-6 bg-white rounded-2xl shadow-sm border border-[#e6e2d8]">
                 <p className="text-[#151515] font-medium leading-relaxed">
                   {history[history.length - 1].role === "assistant" ? history[history.length - 1].content : (history.length > 1 ? history[history.length - 2].content : "")}
                 </p>
               </div>
            )}
            
            <div className="relative">
              <textarea
                value={transcript + interimTranscript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setInterimTranscript("");
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!assistantSpeaking && !isFetching && (transcript + interimTranscript).trim()) {
                      void submitAnswer();
                    }
                  }
                }}
                placeholder={isFetching ? "Thinking..." : isListening ? "Listening... (speak now)" : "Type or speak your answer..."}
                disabled={assistantSpeaking || isFetching}
                className="w-full min-h-[120px] resize-none rounded-2xl border border-[#d8d2c6] bg-white p-5 pr-16 text-[#171717] shadow-sm focus:border-[#2f6654] focus:outline-none focus:ring-1 focus:ring-[#2f6654] disabled:bg-[#f9f8f6] disabled:text-[#8a7f70]"
              />
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  onClick={() => isListening ? stopDeepgramListening() : startDeepgramListening()}
                  disabled={assistantSpeaking || isFetching}
                  className={`grid size-10 place-items-center rounded-full transition-colors ${
                    isListening ? "bg-[#b7472a] text-white hover:bg-[#8f2f23]" : "bg-[#ece5da] text-[#5f564a] hover:bg-[#d8d2c6]"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={isListening ? "Stop listening" : "Start listening"}
                >
                  {isListening ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </button>
                <button
                  onClick={submitAnswer}
                  disabled={assistantSpeaking || isFetching || !(transcript + interimTranscript).trim()}
                  className="grid size-10 place-items-center rounded-full bg-[#2f6654] text-white transition-colors hover:bg-[#255243] disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Submit answer"
                >
                  <Send className="size-5" />
                </button>
              </div>
            </div>
            {graceCountdown !== null && (
              <p className="mt-2 text-center text-xs text-[#8a7f70] animate-pulse">
                Submitting in {graceCountdown}s...
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
