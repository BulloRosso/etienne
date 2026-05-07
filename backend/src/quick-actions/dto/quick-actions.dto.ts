export interface QuickActionDto {
  id: string;
  title: string;
  prompt: string;
  icon?: string;
  sortOrder?: number;
}

export interface QuickActionsDto {
  actions: QuickActionDto[];
}
