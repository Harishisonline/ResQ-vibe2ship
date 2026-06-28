import { FullScreenLoader } from "@/components/full-screen-loader";

export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <FullScreenLoader message="Loading page" />
    </div>
  );
}
