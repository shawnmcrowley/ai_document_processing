"use client"
import FileUploader from "@/components/FileUploader";
import Landing from "@/components/landing";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FiUpload, FiSearch, FiChevronDown, FiX } from "react-icons/fi";

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [selectedModel, setSelectedModel] = useState("llama3:2");

  const handleFilesSelected = async (files) => {
    setIsProcessing(true);
    setError(null);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("model", selectedModel);
      const response = await fetch("/api/v1/parse", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process PDF");
      }
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message || "An error occurred while processing the PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    setSearchResults([]);
    setSelectedMetadata(null);
    try {
      const response = await fetch(`/api/v1/search?query=${encodeURIComponent(searchQuery)}&model=${selectedModel}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to search documents");
      }
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setError(err.message || "An error occurred while searching");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Landing selectedModel={selectedModel} onModelChange={setSelectedModel}>
      <div className="flex flex-col gap-10 items-center w-full">
        <Card className="w-full shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FiUpload className="text-blue-500" /> Upload a Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileUploader onFilesSelected={handleFilesSelected} disabled={isProcessing} />
            {isProcessing && <div className="text-blue-600 mt-4 animate-pulse">Processing...</div>}
            {error && <div className="text-red-600 mt-4 font-medium">{error}</div>}
            {results && results.chunks && (
              <div className="mt-4 text-green-600 font-medium">
                Document processed successfully!
              </div>
            )}
          </CardContent>
        </Card>
        {/* Semantic Search UI */}
        <Card className="w-full shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FiSearch className="text-blue-500" /> Semantic Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <Input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={isProcessing}
                className="flex-1"
              />
              <Button type="submit" disabled={isProcessing || !searchQuery.trim()} className="flex items-center gap-2">
                <FiSearch /> Search
              </Button>
            </form>
            {searchResults.length > 0 && (
              <ScrollArea className="h-[500px] w-full rounded border bg-muted p-2">
                <div className="flex flex-col gap-4">
                  {searchResults.map((result, idx) => (
                    <Card key={idx} className="bg-white border border-gray-200 rounded-lg shadow hover:shadow-lg transition-all w-full">
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-100 text-green-700 px-2 py-1 text-xs font-semibold">
                            {(result.relevance * 100).toFixed(1)}% Relevant
                          </Badge>
                        </div>
                        <div className="text-base leading-7 w-full space-y-4">
                          {result.paragraphs?.map((para, pIdx) => (
                            <p key={pIdx} className="text-gray-800">{para}</p>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-3 pt-3 border-t">
                          <span className="font-medium">{result.metadata.filename}</span>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => setSelectedMetadata(result.metadata)}
                            type="button"
                          >
                            <FiChevronDown className="inline-block mr-1" /> Metadata
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        {/* Metadata Dropdown */}
        {selectedMetadata && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white border border-gray-300 rounded shadow-lg p-4 w-full max-w-md z-50 animate-fade-in">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold">Document Metadata</span>
              <Button onClick={() => setSelectedMetadata(null)} variant="ghost" size="sm"><FiX /></Button>
            </div>
            <ScrollArea className="h-64">
              <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(selectedMetadata, null, 2)}</pre>
            </ScrollArea>
          </div>
        )}
      </div>
    </Landing>
  );
}
