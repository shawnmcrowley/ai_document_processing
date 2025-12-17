'use client'
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODEL_OPTIONS = [
  { value: "llama3:2", label: "Llama 3.2" },
  { value: "deepcoder2", label: "Deep Coder 2" },
  { value: "gpt-oss", label: "GPT-OSS" },
];

export default function Header({ selectedModel, onModelChange }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="w-full border-b bg-white/90 backdrop-blur sticky top-0 z-10 shadow-sm">
      <div className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <Image src="/images/LycraLogo.jpg" alt="Lycra Logo" width={32} height={32} />
          <span className="font-bold text-xl tracking-tight">AI Document Processing</span>
        </div>
        <div className="hidden md:flex items-center gap-3">
          {selectedModel && onModelChange && (
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Link href="/">
            <Button variant="outline">Get Started</Button>
          </Link>
          <Link href="/api-docs">
            <Button variant="outline">API Docs</Button>
          </Link>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="md:hidden">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="md:hidden px-8 pb-4 space-y-2">
          {selectedModel && onModelChange && (
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Link href="/" onClick={() => setIsOpen(false)}>
            <Button variant="outline" className="w-full">Get Started</Button>
          </Link>
          <Link href="/api-docs" onClick={() => setIsOpen(false)}>
            <Button variant="outline" className="w-full">API Docs</Button>
          </Link>
        </div>
      )}
    </header>
  );
}
