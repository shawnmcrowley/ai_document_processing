import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export async function POST(req) {
  // Example: accept a PDF file upload (multipart/form-data)
  //const formData = await req.formData();
  //const file = formData.get("file");
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const arrayBuffer = await file.arrayBuffer();
  const pdfBuffer = Buffer.from(arrayBuffer);

  // Extract text from PDF using pdf-parse
  const data = await pdfParse(pdfBuffer);
  // You can access data.text, data.numpages, etc.

  return NextResponse.json({
    text: data.text,
    numpages: data.numpages,
    info: data.info,
    metadata: data.metadata,
  }, { status: 200 });
}