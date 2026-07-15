(function exposeEngine(global) {
  class ConteGameEngine {
    constructor({ data, usage = {}, random = Math.random, onUsageChange = () => {} }) {
      this.data = data;
      this.usage = usage;
      this.random = random;
      this.onUsageChange = onUsageChange;
      this.session = null;
    }

    getStory(storyId) {
      const story = this.data.stories.find((candidate) => candidate.id === storyId);
      if (!story) throw new Error(`Unknown story: ${storyId}`);
      return story;
    }

    randomIndex(length) {
      return Math.min(length - 1, Math.floor(this.random() * length));
    }

    takeVersion(storyId, sentenceIndex, memberId) {
      const story = this.getStory(storyId);
      const versions = story.memberData[memberId]?.[sentenceIndex];
      if (!versions?.length) throw new Error(`Missing variants: ${storyId}/${sentenceIndex}/${memberId}`);

      this.usage[storyId] ??= {};
      this.usage[storyId][sentenceIndex] ??= {};
      let used = this.usage[storyId][sentenceIndex][memberId] ?? [];
      if (used.length >= versions.length) used = [];

      const available = versions.map((_, index) => index).filter((index) => !used.includes(index));
      const versionIndex = available[this.randomIndex(available.length)];
      this.usage[storyId][sentenceIndex][memberId] = [...used, versionIndex];
      this.onUsageChange(this.usage);
      return { versionIndex, text: versions[versionIndex] };
    }

    chooseMember() {
      return this.data.members[this.randomIndex(this.data.members.length)].id;
    }

    emptyMetrics() {
      return Object.fromEntries(
        this.data.members.map((member) => [member.id, { rounds: 0, turns: 0, wrong: 0 }]),
      );
    }

    start(storyId) {
      const story = this.getStory(storyId);
      this.session = {
        storyId,
        sentenceIndex: 0,
        score: 0,
        activeMemberId: this.chooseMember(),
        disabledMemberIds: [],
        metrics: this.emptyMetrics(),
        finished: false,
      };
      this.session.metrics[this.session.activeMemberId].rounds += 1;
      this.session.current = this.takeVersion(storyId, 0, this.session.activeMemberId);
      return this.snapshot(story);
    }

    guess(memberId) {
      if (!this.session || this.session.finished) return { type: 'ignored' };
      if (this.session.disabledMemberIds.includes(memberId)) return { type: 'ignored' };

      const metric = this.session.metrics[this.session.activeMemberId];
      metric.turns += 1;

      if (memberId === this.session.activeMemberId) {
        this.session.score += 1;
        return { type: 'correct', memberId, score: this.session.score };
      }

      metric.wrong += 1;
      this.session.disabledMemberIds.push(memberId);
      const story = this.getStory(this.session.storyId);
      const isLastSentence = this.session.sentenceIndex >= story.references.length - 1;
      if (isLastSentence) {
        this.session.finished = true;
        return {
          type: 'wrong-finished',
          memberId,
          score: this.session.score,
          snapshot: this.snapshot(story),
        };
      }

      this.session.sentenceIndex += 1;
      this.session.current = this.takeVersion(
        this.session.storyId,
        this.session.sentenceIndex,
        this.session.activeMemberId,
      );
      return {
        type: 'wrong',
        memberId,
        advanced: true,
        sentenceIndex: this.session.sentenceIndex,
        current: { ...this.session.current },
      };
    }

    advance() {
      if (!this.session) throw new Error('Cannot advance without an active session');
      const story = this.getStory(this.session.storyId);
      if (this.session.sentenceIndex >= story.references.length - 1) {
        this.session.finished = true;
        return { type: 'finished', snapshot: this.snapshot(story) };
      }

      this.session.sentenceIndex += 1;
      this.session.activeMemberId = this.chooseMember();
      this.session.disabledMemberIds = [];
      this.session.metrics[this.session.activeMemberId].rounds += 1;
      this.session.current = this.takeVersion(
        this.session.storyId,
        this.session.sentenceIndex,
        this.session.activeMemberId,
      );
      return { type: 'advanced', snapshot: this.snapshot(story) };
    }

    snapshot(story = this.getStory(this.session.storyId)) {
      return {
        ...this.session,
        disabledMemberIds: [...this.session.disabledMemberIds],
        metrics: structuredClone(this.session.metrics),
        current: { ...this.session.current },
        sentenceCount: story.references.length,
        story: {
          id: story.id,
          title: story.title,
          shortTitle: story.shortTitle,
          theme: story.theme,
        },
      };
    }
  }

  global.ConteGameEngine = ConteGameEngine;
})(globalThis);
