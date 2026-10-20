"use client";

import { Eye, Info, Layers, ListChecks, Tag } from "lucide-react";
import { vi } from "../../../messages/vi";
import { type SectionPart, SectionNav } from "../../ui/section-nav";
import { EDITOR_SECTIONS } from "./editor-sections";

const T = vi.menu.editor;
const PARTS: readonly SectionPart[] = [
  { id: EDITOR_SECTIONS.info, label: T.sections.info, icon: Info },
  { id: EDITOR_SECTIONS.price, label: T.sections.price, icon: Tag },
  { id: EDITOR_SECTIONS.variants, label: T.sections.variants, icon: Layers },
  { id: EDITOR_SECTIONS.groups, label: T.sections.groups, icon: ListChecks },
  { id: EDITOR_SECTIONS.preview, label: T.sections.preview, icon: Eye },
];

/** The product editor's parts: general, price, sizes, option groups. */
export function EditorSectionNav() {
  return <SectionNav label={T.sectionsLabel} parts={PARTS} />;
}
