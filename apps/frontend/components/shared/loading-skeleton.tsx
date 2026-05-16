import { Skeleton } from '@/components/ui/skeleton';

export function KanbanSkeleton() {
  return (
    <div className="flex gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="w-64 space-y-3">
          <Skeleton className="h-6 w-32" />
          {[1, 2].map((j) => <Skeleton key={j} className="h-24 w-full rounded-lg" />)}
        </div>
      ))}
    </div>
  );
}
