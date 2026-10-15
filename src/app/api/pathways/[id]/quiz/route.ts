import { NextResponse } from "next/server";
import { gradeQuestion, gradeQuiz } from "@/lib/grade";
import { requireGuest } from "@/lib/guest";
import { unlockNextCard } from "@/lib/pipeline";
import { getPathway, publicPathway, savePathway } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guest = await requireGuest();
    const { id } = await context.params;
    const pathway = await getPathway(id);
    if (!pathway || pathway.guestId !== guest.id) {
      return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      nodeId?: string;
      questionId?: string;
      answer?: string;
      answers?: Record<string, string>;
    };
    const node = pathway.nodes.find((item) => item.id === body.nodeId);
    if (!node || node.kind !== "quiz" || !node.quiz) {
      return NextResponse.json({ error: "Quiz not ready." }, { status: 400 });
    }
    if (node.status === "locked") {
      return NextResponse.json({ error: "Finish the lesson first." }, { status: 400 });
    }

    /* ---- One-question mode: the card-by-card UI checks as it goes. ---- */
    if (typeof body.questionId === "string") {
      const verdict = gradeQuestion(node.quiz, body.questionId, body.answer ?? "");
      if (!verdict) {
        return NextResponse.json({ error: "Unknown question." }, { status: 400 });
      }
      /* XP and unlocking are settled by the final batch call, so a
         mid-quiz check never mutates progression. */
      return NextResponse.json({ verdict });
    }

    /* ---- Batch mode: grades the whole set and settles progression. ---- */
    const result = gradeQuiz(node.quiz, body.answers || {});
    const latest = (await getPathway(id)) ?? pathway;
    const liveNode = latest.nodes.find((item) => item.id === node.id) ?? node;
    latest.gradedNodeIds = latest.gradedNodeIds ?? [];
    if (!latest.gradedNodeIds.includes(liveNode.id)) {
      latest.xp += result.xp;
      latest.gradedNodeIds.push(liveNode.id);
    }
    if (result.passed) {
      unlockNextCard(latest, liveNode.id);
    }
    await savePathway(latest);

    return NextResponse.json({
      pathway: publicPathway(latest),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not grade quiz.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

