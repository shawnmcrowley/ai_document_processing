import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export async function POST(req) {
  // Accept PDF file upload (multipart/form-data)
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const arrayBuffer = await file.arrayBuffer();
  // Use Uint8Array instead of Buffer (Buffer is deprecated in edge/serverless runtimes)
  const pdfBuffer = new Uint8Array(arrayBuffer);

  try {
    // Extract text from PDF using pdf-parse
    const data = await pdfParse(pdfBuffer);
    return NextResponse.json({
      text: data.text,
      numpages: data.numpages,
      info: data.info,
      metadata: data.metadata,
    }, { status: 200 });
  } catch (err) {
    // If pdf-parse throws ENOENT, it means it tried to open a file path instead of a buffer
    return NextResponse.json({ error: err.message, details: err }, { status: 500 });
  }
}