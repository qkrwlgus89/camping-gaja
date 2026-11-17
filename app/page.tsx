import Camp from "@/components/camp";
export const dynamic = "force-dynamic";
export default function Home() { return <Camp initialEpoch={Date.now()} lab={process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_SCENE_LAB === "true"} />; }
