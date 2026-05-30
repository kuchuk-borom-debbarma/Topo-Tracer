import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadFlowAsPDF(
  canvasEl: HTMLElement,
  traceId: string
): Promise<void> {
  // Show a brief loading indicator
  const originalCursor = document.body.style.cursor;
  document.body.style.cursor = "wait";

  try {
    // Capture at 2x for sharpness
    const rendered = await html2canvas(canvasEl, {
      scale: 1.5,
      backgroundColor: "#07090f",
      useCORS: true,
      allowTaint: true,
      logging: false,
    });

    const imgData = rendered.toDataURL("image/png");
    const imgW = rendered.width;
    const imgH = rendered.height;

    // Choose PDF orientation and size based on canvas aspect ratio
    const isLandscape = imgW > imgH;
    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "px",
      format: [imgW, imgH],
      compress: true,
    });

    pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);

    const safeId = traceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`topo-trace_${safeId}_${date}.pdf`);
  } finally {
    document.body.style.cursor = originalCursor;
  }
}
