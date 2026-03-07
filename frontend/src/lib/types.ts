export interface User {
    id: string;
    name: string;
    avatar: string;
    bio: string;
    skills: string[];
    trustScore: number;
    verified: boolean;
    lat: number;
    lng: number;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    distanceLimitKm: number;
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
    timestamp: number;
}

export interface ChatThread {
    id: string;
    participants: string[];
    participantNames: string[];
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
