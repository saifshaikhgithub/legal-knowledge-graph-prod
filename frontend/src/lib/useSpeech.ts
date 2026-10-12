import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

/**
 * Browser speech-to-text (Chrome / Edge). Calls onFinal with each finished phrase
 * and keeps listening until stopped.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const Ctor = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;
  const supported = !!Ctor;

  useEffect(() => {
    if (!Ctor) return;
    const rec: Recognition = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (event: any) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) onFinalRef.current(text.trim() + ' ');
        else partial += text;
      }
      setInterim(partial);
    };
    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantRef.current = false;
        setListening(false);
      }
    };
    rec.onend = () => {
      if (wantRef.current) {
        try { rec.start(); } catch { /* already started */ }
      } else {
        setListening(false);
        setInterim('');
      }
    };
    recognitionRef.current = rec;
    return () => {
      wantRef.current = false;
      try { rec.stop(); } catch { /* not running */ }
    };
  }, [Ctor]);

  const toggle = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (wantRef.current) {
      wantRef.current = false;
      rec.stop();
      setListening(false);
    } else {
      wantRef.current = true;
      try { rec.start(); } catch { /* already started */ }
      setListening(true);
    }
  }, []);

  return { supported, listening, interim, toggle };
}
