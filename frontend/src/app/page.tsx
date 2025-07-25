import { redirect } from "next/navigation";

export default function Home() {
    // redirect to dashboard
    redirect("/dashboard");
    return null;
}
