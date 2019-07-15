import Vue from "vue";
import { anime365API, myanimelistAPI, findEpisode } from "../../../../helpers";
import { storage } from "kv-storage-polyfill";

const worker = new Worker('/player/worker.js')


/**
 * Загружает данные по аниме
 * @param {{state: vuex.Player, commit: Function, dispatch: Function}} context 
 * @param {{anime: number, episode: number}} payload 
 */
export async function loadEpisodes({ state, commit, dispatch }, { anime, episode: startEpisodeInt = 0 }) {
  /**
   * @type {anime365.api.SeriesCollection}
   */
  let { data: [{ episodes, type, numberOfEpisodes }] } = await anime365API(`/series/?myAnimelist=${anime}`)

  if (!episodes || !episodes.length) {
    return
  }

  episodes = episodes.filter(
    e =>
      e.isActive
      && (!numberOfEpisodes || parseFloat(e.episodeInt) <= numberOfEpisodes)
  )

  const episodeType = episodes[0].episodeType
  if (!episodes.every(e => e.episodeType === episodeType)) {
    episodes = episodes.filter(e => e.episodeType === type)
  }

  episodes = episodes.map((episode, index) => {
    episode.myAnimelist = anime
    episode.next = episodes[index + 1]
    episode.previous = episodes[index - 1]
    return episode
  })

  commit('setEpisodes', episodes)

  if (!startEpisodeInt) {
    startEpisodeInt = 0
  }

  /**
   * startEpisodeInt — Номер серии которую необходимо запустить
   * 
   * Поиск наиболее подходящей серии для запуска
   */
  let startEpisode = findEpisode(state.episodes, startEpisodeInt)

  // Если следующей серии не найдено — выполнить поиск предыдущей серии перебором
  if (!startEpisode) {
    startEpisode = findEpisode(state.episodes, startEpisodeInt - 1)
  }


  // Если предыдущая серия не найдена — выполнить поиск нулевой серии перебором
  if (!startEpisode && startEpisodeInt > 2) {
    startEpisode = findEpisode(state.episodes, 0)
  }

  // Если нулевая серия не найдена — выполнить поиск первой серии перебором
  if (!startEpisode && startEpisodeInt > 2) {
    startEpisode = findEpisode(state.episodes, 1)
  }

  // Если первая серия не найдена — использовать первый элемент из массива серий
  if (!startEpisode) {
    startEpisode = state.episodes[0]
  }

  if (startEpisode) {
    await dispatch('selectEpisode', startEpisode)
  }

  // await dispatch('loadEpisodesTitle')
}


/**
 * Устанавливает текущую серию
 * Загружает переводы для текущейсерии
 * Предзагружает данные для следующей серии
 * @param {{getters: {episodes: anime365.Episode[], nextEpisode?: anime365.Episode, previousEpisode?: anime365.Episode}, commit: Function, dispatch: Function}} context 
 * @param {anime365.Episode} episode
 */
export async function selectEpisode({ getters, commit, dispatch }, episode) {
  commit('selectEpisode', episode)

  {
    const currentURL = new URL(location.href)
    currentURL.searchParams.set('episode', episode.episodeInt)
    history.replaceState(history.state, '', currentURL.toString())
  }

  await dispatch('loadTranslations', episode)
  let translation = await dispatch('getPriorityTranslation', episode)

  await dispatch('selectTranslation', { translation })

  Vue.nextTick(() => {
    if (!getters.nextEpisode) {
      dispatch('shikimori/loadNextSeason', null, { root: true })
    }
  })

}


/**
 * Загружает доступные переводы для серии
 * Может вызываться неограниченное число раз.
 * Поэтому необходимо обязательно проверять наличие переводов, чтобы избежать повторной загрузки
 * @param {{commit: Function}} context
 * @param {anime365.Episode} episode 
 */
export async function loadTranslations({ commit }, episode) {
  if (!episode || (Array.isArray(episode.translations) && episode.translations.length > 0)) {
    return
  }

  /**
   * @type {anime365.api.EpisodeSelf}
   */
  const { data } = await anime365API(`/episodes/${episode.id}`)
  data.translations = data.translations.map(translation => {
    if (!translation.authorsSummary) {
      translation.authorsSummary = 'Неизвестный'
    }

    return translation
  })

  commit('setTranslations', { episode, translations: data.translations })
  return data
}


/**
 * Устанавливает текущий перевод
 * Сохраняет перевод в хранилище приоритетных переводов
 * @param {{commit: Function, dispatch: Function, getters: {selectedEpisode: anime365.Episode, nextEpisode: anime365.Episode}}} context
 * @param {{translation: anime365.Translation, trusted: boolean}} translation 
 */
export async function selectTranslation({ commit }, { translation }) {
  commit('selectTranslation', translation.id)


  Vue.nextTick(async () => {
    /**
     * @type {Map<number, anime365.Translation>}
     */
    let lastSelectedTranslations = await storage.get("lastSelectedTranslations");

    // Если ранее хранилище переводов не создавалось — инициализировать его
    if (!lastSelectedTranslations) {
      lastSelectedTranslations = new Map()
    }

    lastSelectedTranslations.set(translation.seriesId, translation)

    await storage.set("lastSelectedTranslations", lastSelectedTranslations);
  })

}


/**
 * Переключает на предыдущую серию
 * @param {{getters: {previousEpisode: anime365.Episode}, dispatch: Function}} context 
 */
export function selectPreviousEpisode({ getters: { previousEpisode }, dispatch }) {
  if (previousEpisode) {
    dispatch('selectEpisode', previousEpisode.id)
  }
}


/**
 * Переключает на следующую серию
 * @param {{getters: {nextEpisode: anime365.Episode}, dispatch: Function}} context 
 */
export function selectNextEpisode({ getters: { nextEpisode }, dispatch }) {
  if (nextEpisode) {
    dispatch('selectEpisode', nextEpisode.id)
  }
}


/**
 * 
 * @param {{state: vuex.Player, commit: Function}} context 
 */
export async function loadEpisodesTitle({ commit, state }) {
  let currentPage = 1
  let episodesToCommit = []

  while (true) {
    const promise = myanimelistAPI(`/anime/${state.series.myAnimeListId}/episodes/${currentPage}`);

    if (episodesToCommit.length) {
      commit('loadEpisodesTitle', episodesToCommit)
      episodesToCommit = []
    }

    const resp = await promise
    if (!resp.episodes || !resp.episodes.length) break

    episodesToCommit = resp.episodes

    if (currentPage >= resp.episodes_last_page) {
      break
    }

    currentPage++
  }

  if (episodesToCommit.length) {
    commit('loadEpisodesTitle', episodesToCommit)
  }

}


/**
 * 
 * @param {any} context
 * @param {anime365.Episode} episode 
 */
export function getPriorityTranslation({ }, episode) {

  return new Promise(resolve => {

    worker.onmessage = ({ data: { translation } }) => {
      worker.onmessage = null
      resolve(translation)
    }
    worker.postMessage({ episode })
  })
}

/**
 * Загружает переводы для следующей серии
 * @param {{getters: {nextEpisode: anime365.Episode}, dispatch: Function}} context 
 */
export async function preloadNextEpisode({ getters, dispatch }) {
  if (!getters.nextEpisode) {
    return
  }

  await dispatch('loadTranslations', getters.nextEpisode)
  /** @type {anime365.Translation} */
  const translation = await dispatch('getPriorityTranslation', getters.nextEpisode)
  if (translation) {
    const link = document.createElement('link');
    link.href = translation.embedUrl
    link.as = 'document'
    document.head.appendChild(link);
  }

  return translation
}