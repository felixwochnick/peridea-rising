import { effectScope, nextTick, watch } from 'vue'
import type { BotPlayer } from './bot'
import type { GalacticGame } from './game'

/**
 * Keeps a game running: bots take their turns and answer trade offers, and the victory is
 * checked whenever the active player's points change. Used by the solo game page and by the
 * multiplayer room on the server. Returns a function that stops it.
 */
export function driveGame(g: GalacticGame, bot: BotPlayer) {
  const scope = effectScope(true)
  scope.run(() => {
    g.botBusy.value = false // a bot turn interrupted by leaving the page / restarting must not block

    // Bots act whenever it's their turn and nothing else is going on.
    function driveBots() {
      if (g.winner.value || g.startRoll.value || g.botBusy.value) return
      const p = g.players.value[g.activeIndex.value]
      if (!p || p.kind === 'human') return
      if (g.setup.value) bot.setupTurn(p.id)
      else if (!g.diceRoll.value && !g.pirates.value) bot.playTurn(p.id)
    }
    watch(
      [g.activeIndex, () => g.setup.value?.step, () => !!g.startRoll.value, g.botBusy, () => !!g.pirates.value, () => g.players.value.map(p => p.kind).join()],
      () => nextTick(driveBots),
      { immediate: true },
    )

    // Bots answer every new trade offer (from a human or from another bot).
    watch(() => g.trade.value?.id, () => {
      if (g.trade.value) bot.answerOffer(g.trade.value)
    })

    // Victory: checked whenever the active player's points change (incl. victory point cards).
    watch(
      () => [g.activePlayer.value.id, g.stats(g.activePlayer.value).totalPoints, !!g.setup.value] as const,
      () => g.checkVictory(),
    )
  })
  return () => scope.stop()
}
