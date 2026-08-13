export interface QuotedReply {
  id: string;
  senderName: string;
  snippet: string;
  isImage?: boolean;
}

export interface ImagePayload {
  image: string; // base64 data URL
  caption?: string;
  replyTo?: QuotedReply;
  reactions?: Record<string, string[]>; // emoji -> array of user profile names/IDs
}

export interface StructuredPayload {
  text: string;
  replyTo?: QuotedReply;
  reactions?: Record<string, string[]>;
}

export function parseImagePayload(body: string): ImagePayload | null {
  if (!body || typeof body !== 'string') return null;

  const target = body.trim();

  // If wrapped inside a [MSG_PAYLOAD]:...
  if (target.startsWith('[MSG_PAYLOAD]:')) {
    try {
      const jsonStr = target.substring('[MSG_PAYLOAD]:'.length);
      const parsed = JSON.parse(jsonStr) as StructuredPayload;
      if (parsed.text && parsed.text.startsWith('[IMAGE_MSG]:')) {
        const innerImg = parseImagePayload(parsed.text);
        if (innerImg) {
          if (!innerImg.reactions && parsed.reactions) innerImg.reactions = parsed.reactions;
          if (!innerImg.replyTo && parsed.replyTo) innerImg.replyTo = parsed.replyTo;
          return innerImg;
        }
      }
    } catch {
      // fallback
    }
  }

  if (!target.startsWith('[IMAGE_MSG]:')) {
    return null;
  }

  try {
    const jsonStr = target.substring('[IMAGE_MSG]:'.length);
    return JSON.parse(jsonStr) as ImagePayload;
  } catch {
    return null;
  }
}

export function formatImagePayload(image: string, caption?: string, replyTo?: QuotedReply): string {
  const payload: ImagePayload = {
    image,
    caption: caption?.trim() || undefined,
    replyTo: replyTo || undefined,
  };
  return `[IMAGE_MSG]:${JSON.stringify(payload)}`;
}

export function parseStructuredPayload(body: string): StructuredPayload {
  if (!body || typeof body !== 'string') {
    return { text: '' };
  }
  const target = body.trim();
  if (target.startsWith('[MSG_PAYLOAD]:')) {
    try {
      const jsonStr = target.substring('[MSG_PAYLOAD]:'.length);
      return JSON.parse(jsonStr) as StructuredPayload;
    } catch {
      return { text: target };
    }
  }
  return { text: target };
}

export function formatStructuredPayload(text: string, replyTo?: QuotedReply, reactions?: Record<string, string[]>): string {
  if (!replyTo && (!reactions || Object.keys(reactions).length === 0)) {
    return text;
  }
  const payload: StructuredPayload = {
    text: text.trim(),
    replyTo: replyTo || undefined,
    reactions: reactions && Object.keys(reactions).length > 0 ? reactions : undefined,
  };
  return `[MSG_PAYLOAD]:${JSON.stringify(payload)}`;
}

export function updatePayloadReactions(body: string, emoji: string, userName: string): string {
  const imgPayload = parseImagePayload(body);
  if (imgPayload) {
    const reactions = imgPayload.reactions || {};
    const currentUsers = reactions[emoji] || [];
    if (currentUsers.includes(userName)) {
      reactions[emoji] = currentUsers.filter((u) => u !== userName);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...currentUsers, userName];
    }
    imgPayload.reactions = reactions;
    return `[IMAGE_MSG]:${JSON.stringify(imgPayload)}`;
  }

  const structured = parseStructuredPayload(body);
  const reactions = structured.reactions || {};
  const currentUsers = reactions[emoji] || [];
  if (currentUsers.includes(userName)) {
    reactions[emoji] = currentUsers.filter((u) => u !== userName);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji] = [...currentUsers, userName];
  }
  structured.reactions = reactions;
  return formatStructuredPayload(structured.text, structured.replyTo, structured.reactions);
}

export function getSnippetFromMessageBody(body: string | undefined | null): string {
  if (!body) return 'No messages yet';
  const trimmed = body.trim();
  if (trimmed.startsWith('[IMAGE_MSG]:') || trimmed.includes('[IMAGE_MSG]:')) {
    const imgPayload = parseImagePayload(trimmed);
    if (imgPayload?.caption) {
      return `📷 Photo: ${imgPayload.caption}`;
    }
    return '📷 Photo';
  }
  if (trimmed.startsWith('[VOICE_NOTE]:')) {
    return '🎙️ Voice Note';
  }
  if (trimmed.startsWith('[MSG_PAYLOAD]:')) {
    const structured = parseStructuredPayload(trimmed);
    if (structured.text.startsWith('[IMAGE_MSG]:')) return '📷 Photo';
    return structured.text;
  }
  return trimmed;
}
