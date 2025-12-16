import Header from "./header";
import Footer from "./footer";

export default function Landing({ children, selectedModel, onModelChange }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 text-gray-900 flex flex-col">
      <Header selectedModel={selectedModel} onModelChange={onModelChange} />
      <main className="flex-1 w-full max-w-6xl mx-auto py-10 px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
