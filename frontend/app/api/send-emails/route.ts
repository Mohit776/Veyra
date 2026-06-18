import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const { candidates } = await req.json();

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: "No candidates provided" }, { status: 400 });
    }

    const userEmail = process.env.MAIL;
    const userPassword = process.env.APP_PASSWORD;

    if (!userEmail || !userPassword) {
      return NextResponse.json(
        { error: "Email credentials not configured on the server" },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: userEmail,
        pass: userPassword,
      },
    });

    // Separate candidates that have a real email from those that don't
    const withEmail = candidates.filter((c: any) => c.email && c.email.trim() !== "");
    const noEmail = candidates.filter((c: any) => !c.email || c.email.trim() === "");

    if (withEmail.length === 0) {
      return NextResponse.json(
        {
          error: "No candidate emails found in their resumes. Cannot send notifications.",
          skipped: noEmail.map((c: any) => c.filename),
        },
        { status: 400 }
      );
    }

    const emailPromises = withEmail.map((candidate: any) => {
      const interviewUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/interview/${candidate.candidate_id}`;
      return transporter.sendMail({
        from: userEmail,
        to: candidate.email,
        subject: `Congratulations! You have been shortlisted`,
        html: `
          <p>Dear Candidate,</p>
          <p>We are pleased to inform you that your profile (<strong>${candidate.filename}</strong>) has been shortlisted for the next round of interviews based on your resume score of <strong>${candidate.score}/10</strong>.</p>
          <p>Please click the link below to start your automated interview. This link is valid for 24 hours.</p>
          <p><a href="${interviewUrl}" style="padding: 10px 20px; background-color: #2f6654; color: white; text-decoration: none; border-radius: 5px;">Start Interview</a></p>
          <p>Or copy and paste this URL into your browser: <br/> ${interviewUrl}</p>
          <br/>
          <p>Best Regards,</p>
          <p>The Hiring Team</p>
        `,
      });
    });

    await Promise.all(emailPromises);

    const skippedNames = noEmail.map((c: any) => c.filename);
    const message =
      skippedNames.length > 0
        ? `Emails sent to ${withEmail.length} candidate(s). Skipped ${skippedNames.length} (no email found): ${skippedNames.join(", ")}`
        : `Emails sent to all ${withEmail.length} top candidate(s) successfully!`;

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return NextResponse.json({ error: "Failed to send emails", details: error.message }, { status: 500 });
  }
}
