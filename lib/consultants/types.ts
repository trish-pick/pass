/**
 * Consultant documents (engineering, energy, bushfire, geotech...) that a
 * practice's drawings are compared against. How to read each firm's
 * documents is data (a ConsultantProfile per firm), not code.
 */

export type Discipline = "structural" | "energy" | "bushfire" | "geotech" | "other";

/** How to read one value from a consultant document. */
export type ConsultantFieldRule = {
  /** e.g. "based_on_revision", "site_class", "wind_class", "bal", "star_rating", "address". */
  key: string;
  /** Read the value next to this printed label (like a title block field)... */
  label?: string;
  direction?: "right" | "below";
  /** Lines to read for a labelled value that runs over several lines. Default 1. */
  maxLines?: number;
  /** ...or take the first capture group of this regular expression, matched against the document text. */
  pattern?: string;
  /** Only look on these pages (0-based). Default: all pages. */
  pages?: number[];
};

export type ConsultantProfile = {
  firm: string;
  discipline: Discipline;
  /** Text that identifies the firm's documents, e.g. "resengco.com.au". */
  match: string[];
  fields: ConsultantFieldRule[];
  /** A window schedule to compare with the practice's: a pattern with named groups mark, width and height. */
  windowPattern?: string;
  /** Status text found on the document, e.g. "50% DESIGN REVIEW" or "FOR CONSTRUCTION". */
  statusPattern?: string;
};

export type ConsultantWindow = { mark: string; width: number; height: number };

export type ConsultantDocument = {
  id: string;
  fileName: string;
  firm: string;
  discipline: Discipline;
  /** Values read using the firm's profile. */
  fields: Record<string, string>;
  windows: ConsultantWindow[];
  statuses: string[];
  /**
   * If the document attaches the practice's own sheets (bushfire and energy
   * reports often do), what their title blocks say.
   */
  attachedPlans: { revision: string | null; jobNumber: string | null; date: string | null; sheets: number } | null;
};
