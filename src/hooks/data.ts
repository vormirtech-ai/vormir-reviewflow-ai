import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '../app/shell.tsx';
import { errorMessage, useToast } from '../components/toast.tsx';
import { api } from '../lib/api.ts';

export function useBusinesses() {
  const { org } = useOrg();
  return useQuery({ queryKey: ['businesses', org.id], queryFn: () => api.listBusinesses(org.id) });
}

export function useFunnels() {
  const { org } = useOrg();
  return useQuery({ queryKey: ['funnels', org.id], queryFn: () => api.listFunnels(org.id) });
}

/** Runs a mutation, refreshes cached lists and reports the outcome as a toast. Returns true on success. */
export function useAction() {
  const client = useQueryClient();
  const notify = useToast();
  return async (run: () => Promise<unknown>, success?: string): Promise<boolean> => {
    try {
      await run();
      await client.invalidateQueries();
      if (success) notify(success);
      return true;
    } catch (e) {
      notify(errorMessage(e), 'error');
      return false;
    }
  };
}

export function downloadBlob(content: Blob | string, filename: string, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
