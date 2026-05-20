import { create } from 'zustand';

const useAppTypeModalStore = create((set) => ({
  open: false,
  payload: null,
  project: null,
  title: null,
  openModal: ({ payload, project, title }) =>
    set({ open: true, payload, project: project || null, title: title || null }),
  closeModal: () =>
    set({ open: false, payload: null, project: null, title: null }),
}));

export default useAppTypeModalStore;
