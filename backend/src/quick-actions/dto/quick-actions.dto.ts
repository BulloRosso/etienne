export interface QuickActionDto {
  id: string;
  title: string;
  prompt: string;
  icon?: string;
  sortOrder?: number;
  /** When set, the action is project-scoped and only visible while that project is active. */
  project?: string;
  /** When set, clicking the action opens this file in the preview pane instead of sending the prompt. */
  previewFile?: string;
}

export interface QuickActionsDto {
  actions: QuickActionDto[];
}
