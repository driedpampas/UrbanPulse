import { MESSAGE_REPLY_SNIPPET_MAX_LENGTH } from './constants.ts';
import type {
    AcceptedInteraction,
    AcceptedInteractionRow,
    AdminMessageReport,
    AdminMessageReportRow,
    AuthorPulseRequest,
    ChatParticipantRole,
    InteractionStatus,
    LibraryItem,
    LibraryItemRow,
    Message,
    MessageReportStatus,
    MessageRow,
    PulseFeedItem,
    PulseInteraction,
    PulseInteractionRow,
    PulseRow,
    PulseType,
    Report,
    ReportRow,
    Timerange,
    User,
    UserRow,
} from './types';

export function mapPulseRow(row: PulseRow): PulseFeedItem {
    return {
        id: String(row.id),
        userId: String(row.userId || row.author_id),
        userName: String(row.userName),
        type: (row.type || 'update') as PulseType,
        content: String(row.content),
        timestamp: Number(row.timestamp),
        lat: Number(row.lat),
        lng: Number(row.lng),
        verified: Boolean(row.verified),
        confirmations: Number(row.confirmations),

        isEmergency: Boolean(row.isEmergency || row.is_emergency),
        isSolved: Boolean(row.isSolved || row.is_solved),
        requiredSkills: row.required_skills || [],
        userRole: row.userRole ? String(row.userRole) : undefined,
        userTrustScore: row.userTrustScore ? Number(row.userTrustScore) : undefined,
    };
}

export function mapAuthorPulseRow(row: PulseRow): AuthorPulseRequest {
    return {
        ...mapPulseRow(row),
        acceptedCount: Number(row.accepted_count || 0),
        successfulCount: Number(row.successful_count || 0),
    };
}

export function mapPulseInteractionRow(row: PulseInteractionRow): PulseInteraction {
    return {
        id: String(row.id),
        pulseId: String(row.pulse_id),
        authorId: String(row.author_id),
        helperId: String(row.helper_id),
        helperName: String(row.helper_name || `Neighbor ${String(row.helper_id).slice(0, 6)}`),
        status: row.status as InteractionStatus,
        acceptedAt: Number(row.accepted_at),
        confirmedAt: row.confirmed_at ? Number(row.confirmed_at) : null,
        trustAwarded: Number(row.trust_awarded || 0),
    };
}

export function mapAcceptedInteractionRow(row: AcceptedInteractionRow): AcceptedInteraction {
    return {
        interaction: mapPulseInteractionRow(row),
        pulse: {
            id: String(row.pulse_id),
            content: String(row.pulse_content),
            type: (row.pulse_type || 'update') as PulseType,
            timestamp: Number(row.pulse_timestamp),

            isSolved: Boolean(row.pulse_is_solved),
        },
        author: {
            id: String(row.author_id),
            name: String(row.author_name || `Neighbor ${String(row.author_id).slice(0, 6)}`),
        },
    };
}

export function mapMessageRow(row: MessageRow): Message {
    return {
        id: String(row.id),
        threadId: String(row.thread_id),
        senderId: String(row.sender_id),
        content: String(row.content),
        isEdited: Boolean(row.is_edited),
        messageType: (row.message_type || 'text') as 'text' | 'notice',
        replyToId: row.reply_to_id ? String(row.reply_to_id) : null,
        replyTo: row.reply_to_id
            ? {
                  id: String(row.reply_to_id),
                  senderId: String(row.reply_to_sender_id),
                  senderName: String(row.reply_to_sender_name),
                  snippet: String(row.reply_to_snippet || '').slice(
                      0,
                      MESSAGE_REPLY_SNIPPET_MAX_LENGTH
                  ),
                  isUnavailable: Boolean(row.reply_to_unavailable),
              }
            : null,
        timestamp: Number(row.timestamp),
    };
}

export function mapUserRow(row: UserRow): User {
    return {
        id: String(row.id),
        email: row.email,
        role: row.role,
        isEmailVerified: Boolean(row.is_email_verified),
        verificationToken: row.verification_token,
        passwordResetToken: row.password_reset_token,
        passwordResetExpires: row.password_reset_expires
            ? new Date(row.password_reset_expires)
            : null,
        displayName: row.display_name,
        radius: row.distance_limit_meters ? Number(row.distance_limit_meters) : null,
        location:
            row.lat !== undefined && row.lng !== undefined
                ? { lat: Number(row.lat), lng: Number(row.lng) }
                : null,
        quietHours: row.quiet_hours || [],
        quietDays: row.quiet_days || [],
        timezone: row.timezone,
        trustScore: row.trust_score ? Number(row.trust_score) : 0,
        bio: row.bio,
        profilePictureFilename: row.profile_picture_filename,
        profilePictureMimeType: row.profile_picture_mime_type,
        profilePictureSizeBytes: row.profile_picture_size_bytes
            ? Number(row.profile_picture_size_bytes)
            : null,
        profilePictureUpdatedAt: row.profile_picture_updated_at
            ? new Date(row.profile_picture_updated_at)
            : null,
        verified: Boolean(row.is_verified_neighbor),
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
        deletionRequestedAt: row.deletion_requested_at ? Number(row.deletion_requested_at) : null,
    };
}

export function mapLibraryItemRow(row: LibraryItemRow): LibraryItem {
    return {
        id: String(row.id),
        userId: String(row.author_id),
        userName: String(row.userName || `Neighbor ${String(row.author_id).slice(0, 6)}`),
        type: row.item_type as 'item' | 'skill',
        title: String(row.title),
        description: String(row.description || ''),
        tags: Array.isArray(row.tags) ? row.tags : [],
        available: Boolean(row.is_available),
        createdAt: Number(row.created_at),
    };
}

export function mapReportRow(row: ReportRow): Report {
    return {
        id: String(row.id),
        targetId: String(row.target_id),
        targetType: row.target_type as 'pulse' | 'user' | 'message',
        reason: String(row.reason),
        reportedBy: String(row.reported_by),
        timestamp: Number(row.created_at),
        status: row.status as 'pending' | 'resolved' | 'dismissed',
        content: String(row.content || ''),
    };
}

export function mapAdminMessageReportRow(row: AdminMessageReportRow): AdminMessageReport {
    return {
        id: String(row.id),
        messageId: String(row.message_id),
        messageContent: String(row.message_content),
        reason: String(row.reason),
        status: row.status as MessageReportStatus,
        timestamp: Number(row.created_at),
        reporter: {
            id: String(row.reporter_id),
            name: String(row.reporter_name),
        },
        offender: {
            id: String(row.offender_id),
            name: String(row.offender_name),
        },
    };
}

export function normalizeChatRoles(roles: string[]): ChatParticipantRole[] {
    return roles
        .map((r) => r.toLowerCase())
        .filter((r) => r === 'owner' || r === 'admin') as ChatParticipantRole[];
}

export function normalizeResourceText(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '');
}

export function isSuppressedByQuietWindow(
    quietDays: number[] | null,
    quietHours: Timerange[] | null,
    timezone: string,
    now: Date
): boolean {
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const day = tzNow.getDay();
    if (quietDays?.includes(day)) {
        return true;
    }

    if (quietHours && quietHours.length > 0) {
        const currentTime = tzNow.getHours() * 60 + tzNow.getMinutes();
        for (const range of quietHours) {
            const startParts = range.start.split(':').map(Number);
            const endParts = range.end.split(':').map(Number);

            const startH = startParts[0] ?? 0;
            const startM = startParts[1] ?? 0;
            const endH = endParts[0] ?? 0;
            const endM = endParts[1] ?? 0;

            const startTime = startH * 60 + startM;
            const endTime = endH * 60 + endM;

            if (startTime < endTime) {
                if (currentTime >= startTime && currentTime <= endTime) return true;
            } else {
                if (currentTime >= startTime || currentTime <= endTime) return true;
            }
        }
    }

    return false;
}
