import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface MeetingPdfOptions {
  title: string;
  overview: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{
    task: string;
    assignee: string;
    due_date?: string;
    status?: 'pending' | 'completed';
  }>;
  transcript?: string;
  dateStr?: string;
  sourceElementId?: string;
}

/**
 * Generates an executive PDF report for a meeting.
 * If sourceElementId is provided, renders via high-DPI HTML-to-Canvas to guarantee
 * 100% accurate rendering of CJK (Chinese/Japanese/Korean) fonts and custom CSS.
 * Otherwise, falls back to direct jsPDF vector text rendering.
 */
export async function exportMeetingToPdf(options: MeetingPdfOptions): Promise<void> {
  const {
    title,
    overview,
    key_points,
    decisions,
    action_items,
    transcript,
    dateStr = new Date().toLocaleDateString(undefined, { dateStyle: 'long' }),
    sourceElementId
  } = options;

  // If a source DOM container is provided, use high-DPI canvas capture for perfect CJK & typography
  if (sourceElementId) {
    const element = document.getElementById(sourceElementId);
    if (element) {
      try {
        const canvas = await html2canvas(element, {
          scale: 2, // 2x DPI for crisp text
          useCORS: true,
          logging: false,
          backgroundColor: '#090c15' // dark theme background
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
          heightLeft -= pdfHeight;
        }

        const safeFilename = `${title.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_').slice(0, 40)}_Executive_Summary.pdf`;
        pdf.save(safeFilename);
        return;
      } catch (err) {
        console.warn('[PDF Exporter] Canvas capture fallback, generating direct vector PDF:', err);
      }
    }
  }

  // Direct Vector jsPDF Fallback Generator
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (cursorY + neededHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
      drawHeader();
    }
  };

  const drawHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('MeetWithAI Executive Briefing', margin, 24);
    doc.text(dateStr, pageWidth - margin, 24, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 28, pageWidth - margin, 28);
  };

  // Initial header
  drawHeader();
  cursorY = 56;

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, margin, cursorY);
  cursorY += titleLines.length * 26 + 10;

  // Metadata badge bar
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(79, 70, 229);
  doc.text(`Generated on ${dateStr} · AI Synthesized Intelligence`, margin, cursorY);
  cursorY += 16;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, cursorY, margin + contentWidth, cursorY);
  cursorY += 22;

  // Section 1: Executive Overview
  checkPageBreak(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text('1. Executive Overview', margin, cursorY);
  cursorY += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const overviewLines = doc.splitTextToSize(overview || 'No overview provided.', contentWidth - 10);
  checkPageBreak(overviewLines.length * 14 + 10);
  doc.text(overviewLines, margin + 6, cursorY);
  cursorY += overviewLines.length * 14 + 20;

  // Section 2: Key Discussion Points
  if (key_points && key_points.length > 0) {
    checkPageBreak(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('2. Key Discussion Points', margin, cursorY);
    cursorY += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    for (const point of key_points) {
      const bulletLines = doc.splitTextToSize(`• ${point}`, contentWidth - 16);
      checkPageBreak(bulletLines.length * 14 + 4);
      doc.text(bulletLines, margin + 6, cursorY);
      cursorY += bulletLines.length * 14 + 4;
    }
    cursorY += 16;
  }

  // Section 3: Decisions Concluded
  if (decisions && decisions.length > 0) {
    checkPageBreak(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('3. Decisions Concluded', margin, cursorY);
    cursorY += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    for (const decision of decisions) {
      const decisionLines = doc.splitTextToSize(`✓ ${decision}`, contentWidth - 16);
      checkPageBreak(decisionLines.length * 14 + 4);
      doc.text(decisionLines, margin + 6, cursorY);
      cursorY += decisionLines.length * 14 + 4;
    }
    cursorY += 16;
  }

  // Section 4: Action Items
  if (action_items && action_items.length > 0) {
    checkPageBreak(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('4. Action Items & Assigned Deliverables', margin, cursorY);
    cursorY += 16;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, cursorY, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('STATUS', margin + 8, cursorY + 13);
    doc.text('DELIVERABLE / TASK', margin + 65, cursorY + 13);
    doc.text('ASSIGNEE', margin + 340, cursorY + 13);
    doc.text('DUE DATE', margin + 440, cursorY + 13);
    cursorY += 24;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    for (const item of action_items) {
      const isDone = item.status === 'completed';
      const statusText = isDone ? '[DONE]' : '[TODO]';
      const taskLines = doc.splitTextToSize(item.task, 260);
      const rowHeight = Math.max(20, taskLines.length * 12 + 6);

      checkPageBreak(rowHeight + 4);

      doc.setTextColor(isDone ? 16 : 100, isDone ? 185 : 116, isDone ? 129 : 139);
      doc.text(statusText, margin + 8, cursorY + 10);

      doc.setTextColor(30, 41, 59);
      doc.text(taskLines, margin + 65, cursorY + 10);

      doc.setTextColor(71, 85, 105);
      doc.text(item.assignee || 'Unassigned', margin + 340, cursorY + 10);
      doc.text(item.due_date || 'N/A', margin + 440, cursorY + 10);

      cursorY += rowHeight;
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, cursorY - 2, margin + contentWidth, cursorY - 2);
    }
    cursorY += 20;
  }

  // Section 5: Transcript (Optional / Appendix)
  if (transcript && transcript.trim().length > 0) {
    checkPageBreak(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('Appendix: Verified Meeting Transcript', margin, cursorY);
    cursorY += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const transcriptLines = doc.splitTextToSize(transcript, contentWidth - 10);

    for (let i = 0; i < transcriptLines.length; i += 35) {
      const batch = transcriptLines.slice(i, i + 35);
      checkPageBreak(batch.length * 11 + 4);
      doc.text(batch, margin + 6, cursorY);
      cursorY += batch.length * 11;
    }
  }

  // Add Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
    doc.text('MeetWithAI — Automated Intelligence Report', margin, pageHeight - 16);
  }

  const safeFilename = `${title.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_').slice(0, 40)}_Executive_Summary.pdf`;
  doc.save(safeFilename);
}
