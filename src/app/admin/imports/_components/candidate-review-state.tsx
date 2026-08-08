"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";

export const CANDIDATE_DIRTY_MESSAGE =
  "Save or discard your changes before continuing review.";

interface CandidateReviewStateValue {
  readonly dirty: boolean;
  readonly dirtyMessageId: string;
  readonly setDirty: (dirty: boolean) => void;
}

const CandidateReviewStateContext =
  createContext<CandidateReviewStateValue | null>(null);

export function CandidateReviewStateProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const dirtyMessageId = useId();

  return (
    <CandidateReviewStateContext.Provider
      value={{ dirty, dirtyMessageId, setDirty }}
    >
      {children}
    </CandidateReviewStateContext.Provider>
  );
}

export function useCandidateReviewState(): CandidateReviewStateValue {
  const value = useContext(CandidateReviewStateContext);
  if (!value) {
    throw new Error(
      "Candidate review controls must be rendered inside CandidateReviewStateProvider.",
    );
  }
  return value;
}
