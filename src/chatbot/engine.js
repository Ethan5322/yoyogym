// useChatEngine — the rule-based conversation state machine.
//
// Responsibilities:
//  - walk the FLOW one visible step at a time (honouring `when` predicates)
//  - validate each answer before advancing
//  - keep an editable transcript (back = correct a previous answer)
//  - auto-save partial progress to localStorage (resume after a pause)
//  - simulate a brief "typing" pause for a natural feel
//
// No external/AI API is required. `prompt(answers)` is fully local.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { FLOW, TOTAL_SECTIONS } from './flow.js';

const STORAGE_KEY = 'gym_registration_progress_v1';
const TYPING_MS = 450;

const stepById = (id) => FLOW.find((s) => s.id === id) || null;
const isVisible = (step, answers) => !step.when || step.when(answers);

function firstVisibleId(answers) {
  const s = FLOW.find((st) => isVisible(st, answers));
  return s ? s.id : null;
}
function nextVisibleId(fromId, answers) {
  const i = FLOW.findIndex((s) => s.id === fromId);
  for (let j = i + 1; j < FLOW.length; j++) {
    if (isVisible(FLOW[j], answers)) return FLOW[j].id;
  }
  return null; // reached the end
}

export function useChatEngine({ onComplete } = {}) {
  const [answers, setAnswers] = useState({});
  const [answeredIds, setAnsweredIds] = useState([]);
  const [currentId, setCurrentId] = useState(() => firstVisibleId({}));
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(false);

  // Restore saved progress once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.currentId) {
          setAnswers(saved.answers || {});
          setAnsweredIds(saved.answeredIds || []);
          setCurrentId(saved.currentId);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setRestored(true);
  }, []);

  // Persist progress whenever it changes (after the initial restore).
  useEffect(() => {
    if (!restored) return;
    if (currentId === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ answers, answeredIds, currentId })
    );
  }, [answers, answeredIds, currentId, restored]);

  // Brief typing indicator each time a new question becomes current.
  useEffect(() => {
    if (currentId === null) return;
    setTyping(true);
    const t = setTimeout(() => setTyping(false), TYPING_MS);
    return () => clearTimeout(t);
  }, [currentId]);

  const current = currentId ? stepById(currentId) : null;

  const submit = useCallback(
    (value) => {
      const step = stepById(currentId);
      if (!step) return;

      if (step.type !== 'statement' && step.validate) {
        const err = step.validate(value, answers);
        if (err) {
          setError(err);
          return;
        }
      }
      setError(null);

      const nextAnswers = step.field ? { ...answers, [step.field]: value } : answers;
      if (step.field) setAnswers(nextAnswers);
      setAnsweredIds((prev) => [...prev, step.id]);

      const nId = nextVisibleId(step.id, nextAnswers);
      setCurrentId(nId);
      if (nId === null && onComplete) onComplete(nextAnswers);
    },
    [currentId, answers, onComplete]
  );

  const goBack = useCallback(() => {
    setError(null);
    setAnsweredIds((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy.pop();
      setCurrentId(last);
      return copy;
    });
  }, []);

  const startOver = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAnswers({});
    setAnsweredIds([]);
    setError(null);
    setCurrentId(firstVisibleId({}));
  }, []);

  const transcript = useMemo(
    () =>
      answeredIds.map((id) => {
        const s = stepById(id);
        return { step: s, value: s && s.field ? answers[s.field] : null };
      }),
    [answeredIds, answers]
  );

  return {
    current,
    transcript,
    typing,
    error,
    answers,
    submit,
    goBack,
    startOver,
    canGoBack: answeredIds.length > 0,
    restored,
    finished: restored && currentId === null,
    section: current ? current.section : TOTAL_SECTIONS,
    totalSections: TOTAL_SECTIONS,
  };
}
