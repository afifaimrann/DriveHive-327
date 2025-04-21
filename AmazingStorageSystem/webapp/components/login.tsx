import { signInWithGoogle } from "@/utils/googleAuth";

export default function Login() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold text-red-700">AMAZING STORAGE SYSTEM</h1>
      <button 
        className="mt-4 px-4 py-2 bg-red-700 text-white rounded-lg"
        onClick={signInWithGoogle}
      >
        Sign in with Google
      </button>
    </div>
  );
}
