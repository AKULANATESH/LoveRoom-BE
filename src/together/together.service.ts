import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmotionalActionType,
  MoodType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

import { SendEmotionalActionDto, ShareMoodDto } from './together.dto';
import {
  CreateCalendarEventDto,
  RecordHourlyTouchDto,
  UpdateLocationDto,
} from './connection.dto';
import { TogetherGateway } from './together.gateway';

const DAYTIME_HOURS = Array.from({ length: 14 }, (_, index) => index + 8);

@Injectable()
export class TogetherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly togetherGateway: TogetherGateway,
  ) {}

  async getRelationshipHome(userId: string) {
    const relationship = await this.findUserRelationship(userId);
    if (!relationship) {
      throw new NotFoundException('You are not connected with a partner yet');
    }

    const partner =
      relationship.userAId === userId ? relationship.userB : relationship.userA;
    const currentUser =
      relationship.userAId === userId ? relationship.userA : relationship.userB;

    const latestMood = relationship.moods[0];
    const recentNotification = relationship.notifications[0] ?? null;

    return {
      user: {
        id: currentUser.id,
        name: currentUser.name,
      },
      partner: {
        id: partner.id,
        name: partner.name,
        avatarUrl: partner.avatarUrl ?? undefined,
        mood: latestMood?.mood ?? MoodType.MISSING_YOU,
        moodLabel: this.getMoodLabel(latestMood?.mood ?? MoodType.MISSING_YOU),
        presence: {
          isOnline: true,
          lastActiveLabel: 'Active now',
          currentActivity: 'In your shared space',
        },
      },
      relationship: {
        id: relationship.id,
        daysTogether: this.getDaysTogether(relationship.startedAt),
        startedAtLabel: `Together since ${relationship.startedAt.toLocaleDateString(
          'en-US',
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          },
        )}`,
        dailyPrompt: 'Send one tiny reminder that they are loved today.',
      },
      milestones: relationship.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        dateLabel: milestone.date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        daysUntil: this.getDaysUntil(milestone.date),
      })),
      recentNotification: recentNotification
        ? {
            id: recentNotification.id,
            title: recentNotification.title,
            body: recentNotification.body,
            createdAtLabel: 'Just now',
            isRead: recentNotification.isRead,
          }
        : null,
    };
  }

  async sendAction(userId: string, dto: SendEmotionalActionDto) {
    const relationship = await this.requireRelationship(userId);
    const partnerId =
      relationship.userAId === userId ? relationship.userBId : relationship.userAId;

    const action = await this.prisma.emotionalAction.create({
      data: {
        relationshipId: relationship.id,
        senderId: userId,
        receiverId: partnerId,
        type: dto.type,
        message: dto.message,
      },
    });

    await this.prisma.notification.create({
      data: {
        relationshipId: relationship.id,
        receiverId: partnerId,
        type: NotificationType.ACTION,
        title: this.getActionTitle(dto.type),
        body: dto.message ?? this.getActionBody(dto.type),
      },
    });

    this.emitPartnerActivity(relationship.id);
    await this.recordHourlyTouchForUser(userId, relationship.id);

    return {
      id: action.id,
      type: action.type,
      message: action.message ?? undefined,
      delivered: true,
    };
  }

  async shareMood(userId: string, dto: ShareMoodDto) {
    const relationship = await this.requireRelationship(userId);
    const partnerId =
      relationship.userAId === userId ? relationship.userBId : relationship.userAId;
    const currentUser =
      relationship.userAId === userId ? relationship.userA : relationship.userB;

    const mood = await this.prisma.mood.create({
      data: {
        relationshipId: relationship.id,
        userId,
        mood: dto.mood,
        note: dto.note,
      },
    });

    await this.prisma.notification.create({
      data: {
        relationshipId: relationship.id,
        receiverId: partnerId,
        type: NotificationType.MOOD,
        title: 'A mood was shared',
        body: `${currentUser.name} is feeling ${this.getMoodLabel(dto.mood).toLowerCase()}.`,
      },
    });

    this.emitPartnerActivity(relationship.id);
    await this.recordHourlyTouchForUser(userId, relationship.id);

    return {
      id: mood.id,
      mood: mood.mood,
      note: mood.note ?? undefined,
    };
  }

  async getNotifications(userId: string) {
    const relationship = await this.requireRelationship(userId);

    const notifications = await this.prisma.notification.findMany({
      where: {
        relationshipId: relationship.id,
        receiverId: userId,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      createdAtLabel: 'Just now',
      isRead: notification.isRead,
    }));
  }

  async getPartnerActivity(userId: string) {
    const relationship = await this.requireRelationship(userId);
    const partnerId =
      relationship.userAId === userId ? relationship.userBId : relationship.userAId;
    const partner =
      relationship.userAId === userId ? relationship.userB : relationship.userA;

    const [actions, moods, partnerActionsCount, myActionsCount, partnerMoodsCount, myMoodsCount] =
      await Promise.all([
      this.prisma.emotionalAction.findMany({
        where: {
          relationshipId: relationship.id,
          senderId: partnerId,
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.mood.findMany({
        where: {
          relationshipId: relationship.id,
          userId: partnerId,
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.emotionalAction.count({
        where: {
          relationshipId: relationship.id,
          senderId: partnerId,
        },
      }),
      this.prisma.emotionalAction.count({
        where: {
          relationshipId: relationship.id,
          senderId: userId,
        },
      }),
      this.prisma.mood.count({
        where: {
          relationshipId: relationship.id,
          userId: partnerId,
        },
      }),
      this.prisma.mood.count({
        where: {
          relationshipId: relationship.id,
          userId,
        },
      }),
    ]);

    const partnerSent = partnerActionsCount + partnerMoodsCount;
    const mySent = myActionsCount + myMoodsCount;

    const items = [
      ...actions.map((action) => ({
        id: action.id,
        kind: 'ACTION' as const,
        actionType: action.type,
        label: this.getActionDisplayLabel(action.type),
        message: action.message ?? undefined,
        createdAt: action.createdAt,
      })),
      ...moods.map((mood) => ({
        id: mood.id,
        kind: 'MOOD' as const,
        mood: mood.mood,
        moodLabel: this.getMoodLabel(mood.mood),
        note: mood.note ?? undefined,
        createdAt: mood.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 30)
      .map((item) => ({
        ...item,
        createdAtLabel: this.formatRelativeTime(item.createdAt),
      }));

    return {
      partnerName: partner.name,
      items,
      emotionStats: {
        partnerSent,
        mySent,
        total: partnerSent + mySent,
        partnerActions: partnerActionsCount,
        myActions: myActionsCount,
        partnerMoods: partnerMoodsCount,
        myMoods: myMoodsCount,
      },
    };
  }

  async getConnectionAwareness(userId: string) {
    const relationship = await this.requireRelationship(userId);
    const partnerId =
      relationship.userAId === userId ? relationship.userBId : relationship.userAId;
    const touchDate = this.getTodayTouchDate();

    const [touches, checkIns, streak] = await Promise.all([
      this.prisma.hourlyTouch.findMany({
        where: {
          relationshipId: relationship.id,
          touchDate,
        },
      }),
      this.prisma.partnerCheckIn.findMany({
        where: { relationshipId: relationship.id },
      }),
      this.computeContactStreak(relationship.id),
    ]);

    const myCheckIn = checkIns.find((checkIn) => checkIn.userId === userId);
    const partnerCheckIn = checkIns.find((checkIn) => checkIn.userId === partnerId);

    return {
      streak,
      daytimeHours: DAYTIME_HOURS,
      hourlyTouches: DAYTIME_HOURS.map((hour) => {
        const mine = touches.some(
          (touch) => touch.userId === userId && touch.hour === hour,
        );
        const partner = touches.some(
          (touch) => touch.userId === partnerId && touch.hour === hour,
        );

        return {
          hour,
          hourLabel: this.formatHourLabel(hour),
          mine,
          partner,
          both: mine && partner,
        };
      }),
      myLocation: this.mapMyLocation(myCheckIn),
      partnerLocation: this.mapPartnerLocation(partnerCheckIn),
    };
  }

  async recordHourlyTouch(userId: string, dto: RecordHourlyTouchDto) {
    const relationship = await this.requireRelationship(userId);
    const hour = dto.hour ?? this.getCurrentDaytimeHour();
    const touchDate = this.getTodayTouchDate();

    if (!DAYTIME_HOURS.includes(hour)) {
      throw new BadRequestException(
        'Hourly touches are only available during daytime hours (8 AM to 9 PM)',
      );
    }

    const touch = await this.prisma.hourlyTouch.upsert({
      where: {
        relationshipId_userId_touchDate_hour: {
          relationshipId: relationship.id,
          userId,
          touchDate,
          hour,
        },
      },
      create: {
        relationshipId: relationship.id,
        userId,
        touchDate,
        hour,
      },
      update: {},
    });

    this.emitConnectionUpdate(relationship.id);

    return {
      id: touch.id,
      hour: touch.hour,
      hourLabel: this.formatHourLabel(touch.hour),
      recorded: true,
    };
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const relationship = await this.requireRelationship(userId);

    const checkIn = await this.prisma.partnerCheckIn.upsert({
      where: {
        relationshipId_userId: {
          relationshipId: relationship.id,
          userId,
        },
      },
      create: {
        relationshipId: relationship.id,
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        locationLabel: dto.locationLabel?.trim(),
        isSharing: dto.isSharing,
      },
      update: {
        latitude: dto.isSharing ? dto.latitude : null,
        longitude: dto.isSharing ? dto.longitude : null,
        accuracy: dto.isSharing ? dto.accuracy : null,
        locationLabel: dto.isSharing ? dto.locationLabel?.trim() : null,
        isSharing: dto.isSharing,
        updatedAt: new Date(),
      },
    });

    this.emitConnectionUpdate(relationship.id);

    return this.mapMyLocation(checkIn);
  }

  async getCalendarEvents(userId: string) {
    const relationship = await this.requireRelationship(userId);
    const startOfToday = this.getTodayTouchDate();

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        relationshipId: relationship.id,
        date: { gte: startOfToday },
      },
      orderBy: { date: 'asc' },
      take: 20,
    });

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      dateLabel: event.date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      timeLabel: event.date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
      daysUntil: this.getDaysUntil(event.date),
      location: event.location ?? undefined,
      note: event.note ?? undefined,
    }));
  }

  async createCalendarEvent(userId: string, dto: CreateCalendarEventDto) {
    const relationship = await this.requireRelationship(userId);

    const event = await this.prisma.calendarEvent.create({
      data: {
        relationshipId: relationship.id,
        createdById: userId,
        title: dto.title.trim(),
        date: new Date(dto.date),
        location: dto.location?.trim(),
        note: dto.note?.trim(),
      },
    });

    this.emitConnectionUpdate(relationship.id);

    return {
      id: event.id,
      title: event.title,
      dateLabel: event.date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      timeLabel: event.date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
      daysUntil: this.getDaysUntil(event.date),
      location: event.location ?? undefined,
      note: event.note ?? undefined,
    };
  }

  private formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);

    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hr ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  private getActionDisplayLabel(type: EmotionalActionType): string {
    const labels: Record<EmotionalActionType, string> = {
      HUG: 'Sent a hug',
      KISS: 'Sent a kiss',
      MISS_YOU: 'Misses you',
      THINKING_OF_YOU: 'Is thinking of you',
    };

    return labels[type];
  }

  private async requireRelationship(userId: string) {
    const relationship = await this.findUserRelationship(userId);
    if (!relationship) {
      throw new BadRequestException('Connect with your partner before using this feature');
    }
    return relationship;
  }

  private async findUserRelationship(userId: string) {
    return this.prisma.relationship.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: true,
        userB: true,
        moods: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        milestones: {
          orderBy: { date: 'asc' },
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  private getDaysTogether(startedAt: Date): number {
    const diff = Date.now() - startedAt.getTime();
    return Math.max(1, Math.floor(diff / 86_400_000));
  }

  private getDaysUntil(date: Date): number {
    const diff = date.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86_400_000));
  }

  private getMoodLabel(mood: MoodType): string {
    const labels: Record<MoodType, string> = {
      HAPPY: 'Happy',
      SAD: 'Sad',
      EXCITED: 'Excited',
      STRESSED: 'Stressed',
      MISSING_YOU: 'Missing you',
      SLEEPY: 'Sleepy',
    };

    return labels[mood];
  }

  private getActionTitle(type: EmotionalActionType): string {
    const titles: Record<EmotionalActionType, string> = {
      HUG: 'A hug is waiting',
      KISS: 'A kiss was sent',
      MISS_YOU: 'You are missed',
      THINKING_OF_YOU: 'You are on their mind',
    };

    return titles[type];
  }

  private getActionBody(type: EmotionalActionType): string {
    const bodies: Record<EmotionalActionType, string> = {
      HUG: 'A warm hold from your partner.',
      KISS: 'A soft little reminder of love.',
      MISS_YOU: 'Distance felt a little louder today.',
      THINKING_OF_YOU: 'A quiet reminder that you matter.',
    };

    return bodies[type];
  }

  private mapMyLocation(
    checkIn?: {
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
      locationLabel: string | null;
      isSharing: boolean;
      updatedAt: Date;
    } | null,
  ) {
    if (!checkIn) {
      return { isSharing: false };
    }

    if (!checkIn.isSharing || checkIn.latitude == null || checkIn.longitude == null) {
      return { isSharing: checkIn.isSharing };
    }

    return this.buildLiveLocation(checkIn);
  }

  private mapPartnerLocation(
    checkIn?: {
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
      locationLabel: string | null;
      isSharing: boolean;
      updatedAt: Date;
    } | null,
  ) {
    if (!checkIn || !checkIn.isSharing || checkIn.latitude == null || checkIn.longitude == null) {
      return null;
    }

    return this.buildLiveLocation(checkIn);
  }

  private buildLiveLocation(checkIn: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    locationLabel: string | null;
    isSharing: boolean;
    updatedAt: Date;
  }) {
    const latitude = checkIn.latitude as number;
    const longitude = checkIn.longitude as number;
    const ageMs = Date.now() - checkIn.updatedAt.getTime();
    const isLive = ageMs <= 2 * 60_000;

    return {
      latitude,
      longitude,
      accuracy: checkIn.accuracy ?? undefined,
      locationLabel: checkIn.locationLabel ?? undefined,
      isSharing: checkIn.isSharing,
      isLive,
      updatedAtLabel: this.formatRelativeTime(checkIn.updatedAt),
      mapUrl: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
    };
  }

  private emitPartnerActivity(relationshipId: string) {
    this.togetherGateway.server
      ?.to(`relationship:${relationshipId}`)
      .emit('partner:activity', { refresh: true });
  }

  private emitConnectionUpdate(relationshipId: string) {
    this.togetherGateway.server
      ?.to(`relationship:${relationshipId}`)
      .emit('connection:update', { refresh: true });
  }

  private getTodayTouchDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  private getCurrentDaytimeHour(): number {
    const hour = new Date().getHours();
    if (hour < 8) {
      return 8;
    }
    if (hour > 21) {
      return 21;
    }
    return hour;
  }

  private formatHourLabel(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour} ${period}`;
  }

  private async recordHourlyTouchForUser(userId: string, relationshipId: string) {
    const hour = this.getCurrentDaytimeHour();
    const touchDate = this.getTodayTouchDate();

    if (!DAYTIME_HOURS.includes(hour)) {
      return;
    }

    await this.prisma.hourlyTouch.upsert({
      where: {
        relationshipId_userId_touchDate_hour: {
          relationshipId,
          userId,
          touchDate,
          hour,
        },
      },
      create: {
        relationshipId,
        userId,
        touchDate,
        hour,
      },
      update: {},
    });

    this.emitConnectionUpdate(relationshipId);
  }

  private async computeContactStreak(relationshipId: string) {
    const groupedTouches = await this.prisma.hourlyTouch.groupBy({
      by: ['touchDate'],
      where: { relationshipId },
      _count: { _all: true },
    });

    const contactDays = new Set(
      groupedTouches
        .filter((group) => group._count._all >= 3)
        .map((group) => group.touchDate.toISOString().slice(0, 10)),
    );

    if (contactDays.size === 0) {
      return { current: 0, longest: 0, label: 'Start your first contact streak today' };
    }

    let longest = 0;
    let streak = 0;
    const sortedDays = [...contactDays].sort();

    for (const day of sortedDays) {
      const previousDay = this.shiftDayKey(day, -1);
      if (contactDays.has(previousDay)) {
        streak += 1;
      } else {
        streak = 1;
      }
      longest = Math.max(longest, streak);
    }

    let current = 0;
    let cursor = this.getTodayTouchDate().toISOString().slice(0, 10);
    while (contactDays.has(cursor)) {
      current += 1;
      cursor = this.shiftDayKey(cursor, -1);
    }

    if (current === 0) {
      const yesterday = this.shiftDayKey(
        this.getTodayTouchDate().toISOString().slice(0, 10),
        -1,
      );
      if (contactDays.has(yesterday)) {
        cursor = yesterday;
        while (contactDays.has(cursor)) {
          current += 1;
          cursor = this.shiftDayKey(cursor, -1);
        }
      }
    }

    return {
      current,
      longest,
      label:
        current > 0
          ? `${current} day${current === 1 ? '' : 's'} in contact`
          : 'Reach out today to start a streak',
    };
  }

  private shiftDayKey(dayKey: string, delta: number): string {
    const date = new Date(`${dayKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }
}
