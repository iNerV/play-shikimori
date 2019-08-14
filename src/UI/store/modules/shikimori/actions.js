import {anime365API, errorMessage, shikimoriAPI, sync, updateAuth} from '../../../../helpers'


/**
 * Загружает данный об аниме
 * @param {{commit: Function, dispatch: Function}} context
 */
export async function loadAnime({commit, dispatch}, animeId) {
	if (!animeId) {
		throw new Error('Anime ID is required. Got ' + animeId)
	}
	const headers = {}

	let auth = await dispatch('getValidCredentials')
	if (auth) {
		headers.Authorization = `${auth.token_type} ${auth.access_token}`
	}

	try {
		/** @type {shikimori.Anime} */
		const anime = await shikimoriAPI(`/animes/${animeId}`, {headers})
		commit('setAnime', anime)
	} catch (e) {
		if (e.error === 'not-granted') {
			errorMessage('Невозможно информацию про аниме: вы запретили доступ к shikimori.one')
		} else {
			Sentry.captureException(e)
			console.error(e)
		}
	}
}


/**
 * Загружает данные о следующем сезоне во франшизе
 * @param {{state: vuex.Shikimori, commit: Function, dispatch: Function}} param0
 */
export async function loadNextSeason({state, commit, dispatch}) {
	if (!state.anime || state.franchise) {
		return
	}

	/** @type {{links: shikimori.FranchiseLink[], nodes: shikimori.FranchiseNode[]}} */
	const franchise = await shikimoriAPI(`/animes/${state.anime.id}/franchise`)
		.catch(e => {
			if (e.error === 'not-granted') {
				errorMessage('Невозможно выполнить поиск следующего сезона: вы запретили доступ к shikimori.one')
			} else {
				Sentry.captureException(e)
				console.error(e)
			}

			return {links: []}
		})

	const sequelLink = franchise.links.find(l => l.source_id === state.anime.id && l.relation === 'sequel')

	if (!sequelLink) {
		return
	}

	const sequelNode = franchise.nodes.find(n => n.id === sequelLink.target_id)

	if (!sequelNode) {
		return
	}


	/** @type {[anime365.api.SeriesCollection, shikimori.Anime]} */
	const [{data: [series]}, anime] = await Promise.all([
		await anime365API(`/series/?myAnimeListId=${sequelNode.id}`)
			.catch(e => {
				if (e.error === 'not-granted') {
					errorMessage('Невозможно загрузить следующий сезон: вы запретили доступ к smotret-anime-365.ru')
				} else {
					Sentry.captureException(e)
					console.error(e)
				}

				return {data: []}
			}),

		(
			async () => {
				const headers = {}

				let auth = await dispatch('getValidCredentials')
				if (!auth) {
					return {} // Если пользователь не авторизован, нет смысла загружать его оценку
				}

				headers.Authorization = `${auth.token_type} ${auth.access_token}`

				/** @type {shikimori.Anime} */
				return await shikimoriAPI(`/animes/${sequelNode.id}`, {headers})
					.catch(e => {
						if (e.error === 'not-granted') {
							errorMessage('Невозможно загрузить ваш список: вы запретили доступ к shikimori.one')
						} else {
							Sentry.captureException(e)
							console.error(e)
						}
					})
			}
		)(),

	])

	if (!series || !series.episodes || !series.episodes.length) {
		return
	}

	const episodeType = series.episodes[0].episodeType
	if (series.episodes.every(e => e.episodeType === episodeType)) {
		series.type = episodeType
	} else {
		series.episodes = series.episodes
			.filter(e =>
				e.isActive
				&& parseFloat(e.episodeInt) <= series.numberOfEpisodes
				&& e.episodeType === series.type,
			)
	}

	if (!series.episodes || !series.episodes.length) {
		return
	}

	sequelNode.series = series.id

	if (anime && anime.user_rate) {
		sequelNode.episodeInt = anime.user_rate.episodes + 1
	}

	commit('setNextSeason', sequelNode)
}


/**
 * Загружает данный о текущем пользователе
 * @param {vuex.Context} context
 */
export async function loadUser({commit, dispatch}) {
	const auth = await dispatch('getValidCredentials')
	if (!auth) {
		return
	}

	try {
		/** @type {shikimori.User} */
		const user = await shikimoriAPI(`/users/whoami`, {
			headers: {
				Authorization: `${auth.token_type} ${auth.access_token}`,
			},
		})

		if (user) {
			commit('setUser', user)
		}
	} catch (e) {
		if (e.error === 'not-granted') {
			errorMessage('Невозможно загрузить ваш профиль: вы запретили доступ к shikimori.one')
		} else {
			Sentry.captureException(e)
			console.error(e)
		}
	}

}


/**
 * Отправляет оценку пользователя на Шикимори
 * @param {{state: vuex.Shikimori, commit: Function, dispatch: Function}} context
 * @param {shikimori.UserRate} user_rate
 */
export async function saveUserRate({dispatch, commit, state: {anime, user}}, user_rate) {
	if (!anime || !user) {
		return null
	}

	if (anime.user_rate) {
		commit('setUserRate', Object.assign({}, anime.user_rate, user_rate))
	}

	let auth = await dispatch('getValidCredentials')
	if (!auth) {
		return
	}

	let newUserRate = Object.assign(
		{},
		{
			target_type: 'Anime',
			target_id: anime.id,
			user_id: user.id,
			status: anime.user_rate && (
				anime.user_rate.status === 'completed' || anime.user_rate.status === 'rewatching'
			) ? 'rewatching' : 'watching',
		},
		user_rate)

	if (newUserRate.status
	    === 'watching'
	    && newUserRate.episodes
	    && anime.episodes
	    && newUserRate.episodes
	    >= anime.episodes) {
		newUserRate.status = 'completed'
	}


	try {
		/** @type {shikimori.UserRate} */
		newUserRate = await shikimoriAPI('/v2/user_rates', {
			method: 'POST',
			body: JSON.stringify({
				user_rate: newUserRate,
			}),
			headers: {
				Authorization: `${auth.token_type} ${auth.access_token}`,
			},
		})
	} catch (e) {
		if (e.error === 'not-granted') {
			errorMessage('Невозможно синхронизироваться с вашим списком: вы запретили доступ к shikimori.one')
		} else {
			console.error('Не удалось синхронизироваться с Шикимори', {error: e})
			Sentry.captureException(e)
			errorMessage('Невозможно синхронизироваться с вашим списком. Откройте консоль для информации об ошибке')

		}
	}

	commit('setUserRate', newUserRate)

	sync.unshift('watching_history', {
		id: anime.id,
		name: anime.russian || anime.name,
		image: anime.image.original,
		episodes: newUserRate.episodes,
	})

	return newUserRate
}


/**
 * Сохраняет текущую серию как просмотренную
 * @param {{rootState: vuex.State,dispatch: Function }}
 */
export function markAsWatched({rootState, dispatch}) {
	if (rootState.shikimori.anime
	    && rootState.shikimori.anime.user_rate
	    && rootState.shikimori.anime.user_rate.episodes
	    === rootState.player.currentEpisode.episodeInt) {
		return rootState.shikimori.anime.user_rate
	}

	return dispatch('saveUserRate', {
		episodes: rootState.player.currentEpisode.episodeInt,
	})
}


export async function getValidCredentials({state, commit}, force = false) {
	try {
		let auth = state.credentials
		if (!auth || !auth.access_token) {

			if (!force) {
				return null
			}

			auth = await updateAuth()
			commit('saveCredentials', auth)
			return auth
		}

		if (1000 * (
			auth.created_at + auth.expires_in
		) <= Date.now()) {
			auth = await updateAuth()
			commit('saveCredentials', auth)
		}

		return auth

	} catch (e) {
		if (e.error === 'not-granted') {
			errorMessage('Невозможно авторизоваться: вы запретили доступ к shikimori.one')
		} else {
			console.error('Невозможно авторизоваться', {error: e})
			Sentry.captureException(e)
			errorMessage('Невозможно авторизоваться. Откройте консоль для информации об ошибке')
		}
	}
}