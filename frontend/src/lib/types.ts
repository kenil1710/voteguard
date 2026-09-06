/** The shapes VoteGuard's views return, as the pages consume them. */

export type Verdict = "RECOMMEND" | "CAUTION" | "OPPOSE" | "UNKNOWN";

export type Dimension = {
  key: string;
  score: number;
  label: string;
  weight: number;
  evidence: string;
};

export type Assessment = {
  found: boolean;
  assessment_id: number;
  proposal_key: string;
  submitted_url: string;
  source_url: string;
  platform: "snapshot" | "tally" | "discourse";
  dao: string;
  dao_id: string;
  submitted_dao: string;
  dao_name_matches: boolean;
  title: string;
  author: string;
  excerpt: string;
  anchor: string;
  verdict: Verdict;
  overall_score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  scores: Record<string, number>;
  labels: string[];
  dimensions: Dimension[];
  flags: string[];
  bands: Record<string, string>;
  evidence: string;
  content_hash: string;
  analyzed_at: number;
  age_seconds: number;
  analyst: string;
  seq: number;
  rubric_version: string;
  reason?: string;
};

export type ProposalRow = {
  proposal_key: string;
  submitted_url: string;
  title: string;
  dao: string;
  dao_id: string;
  platform: Assessment["platform"];
  overall_score: number;
  verdict: Verdict;
  labels: string[];
  flags: string[];
  confidence: Assessment["confidence"];
  assessment_id: number;
  source_url: string;
  analyzed_at: number;
  /** Computed where the row is fetched, never during render. */
  age_seconds?: number;
};

export type Stats = {
  proposals_tracked: number;
  daos_tracked: number;
  total_requests: number;
  total_analyzed: number;
  assessments_issued: number;
  verdicts: Record<string, number>;
  platforms: Record<string, number>;
  average_scores: Record<string, number>;
  total_fees_wei: number | string;
  refunds_owed_wei: number | string;
  rubric_version: string;
};

export type Config = {
  owner: string;
  paused: boolean;
  fee_wei: string | number;
  max_fee_wei: string | number;
  rubric_version: string;
  dimensions: { key: string; weight: number; buckets: string[] }[];
  ordinal_bands: number[][];
  verdicts: string[];
  verdict_thresholds: Record<string, number>;
  verdict_overrides: string[];
  platforms: string[];
  vector_ceilings: Record<string, number>;
  model_fields: string[];
  abstained_rung: number;
  amount_ladder: number[];
  amount_bands: string[];
  length_ladder: number[];
  flag_names: string[];
  limits: Record<string, number>;
  consensus: string[];
};

export type DaoView = {
  found: boolean;
  dao: string;
  dao_id: string;
  proposals_tracked: number;
  total_analyses: number;
  average_scores: Record<string, number>;
  verdicts: Record<string, number>;
  last_analyzed: number;
  /** Computed where the record is fetched, never during render. */
  last_analyzed_age?: number;
  returned: number;
  assessments: Assessment[];
  reason?: string;
};

export type Preview = {
  ok: boolean;
  platform?: string;
  proposal_key?: string;
  fetch_url?: string;
  reference?: string;
  already_analyzed?: boolean;
  latest_assessment_id?: number;
  fee_wei?: string | number;
  paused?: boolean;
  reason?: string;
};
