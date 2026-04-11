export interface User {
    id: string;
    email?: string;
    role?: string;
    name: string;
    avatar: string;
    bio: string;
    trustScore: number;
    verified: boolean;
    lat: number;
    lng: number;
    location?: {
        lat: number;
        lng: number;
    } | null;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    distanceLimit: number;
    quietDays: number[];
    createdAt?: number;
}

export interface Pulse {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string;
    type: 'update' | 'emergency' | 'skill' | 'item' | 'need' | 'pet';
    content: string;
    timestamp: number;
    lat: number;
    lng: number;
    verified: boolean;
    confirmations: number;
    distance?: number;
    requiredSkills?: string[];
}

export interface ResourceCatalogEntry {
    value: string;
    type: 'item' | 'skill';
}

export interface HeroMatchUser {
    id: string;
    displayName: string | null;
    matchedResources: string[];
    suppressedByQuietHours: boolean;
}

export type PulseInteractionStatus = 'accepted' | 'successful';

export interface PulseInteraction {
    id: string;
    pulseId: string;
    authorId: string;
    helperId: string;
    helperName: string;
    status: PulseInteractionStatus;
    acceptedAt: number;
    confirmedAt: number | null;
    trustAwarded: number;
}

export interface AuthorPulseRequest extends Pulse {
    acceptedCount: number;
    successfulCount: number;
}

export interface AcceptedInteraction {
    interaction: PulseInteraction;
    pulse: {
        id: string;
        content: string;
        type: Pulse['type'];
        timestamp: number;
        urgencyLevel: number;
    };
    author: {
        id: string;
        name: string;
    };
}

export interface WeatherData {
    temp: number;
    description: string;
    icon: string;
    severe: boolean;
    warning?: string;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    type?: 'text' | 'notice';
    timestamp: number;
}

export interface ChatThread {
    id: string;
    participants: string[];
    participantNames: string[];
    participantRoles?: Record<string, Array<'owner' | 'admin'>>;
    ownerId?: string | null;
    isGroup: boolean;
    name?: string;
    lastMessage?: ChatMessage;
    messages: ChatMessage[];
}

export interface LibraryItem {
    id: string;
    userId: string;
    userName: string;
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
    available: boolean;
    createdAt?: number;
}

export interface PetMatch {
    id: string;
    reportType: 'lost' | 'found';
    species: string;
    breed: string;
    color: string;
    markings: string;
    photo: string;
    location: string;
    timestamp: number;
    matchConfidence?: number;
    matchedWith?: string;
}

export interface AdminFlag {
    id: string;
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    reason: string;
    reportedBy: string;
    timestamp: number;
    status: 'pending' | 'resolved' | 'dismissed';
    content: string;
}

export interface AdminOverview {
    totalUsers: number;
    adminUsers: number;
    modUsers: number;
    verifiedUsers: number;
    totalPulses: number;
    verifiedPulses: number;
    totalLibraryItems: number;
    availableLibraryItems: number;
}
