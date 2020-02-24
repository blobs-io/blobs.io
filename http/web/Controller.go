package web

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

type CacheEntry struct {
	Path       string
	Cache bool
}

var (
	RouteCache map[string][]byte

	// Routes
	StaticHomepageRoute = CacheEntry {
		Cache: true,
		Path: "public/index.html",
	}
	StaticLoginRoute = CacheEntry {
		Cache: true,
		Path: "public/login.html",
	}
	StaticRegisterRoute = CacheEntry {
		Cache: true,
		Path: "public/register.html",
	}
	StaticAppRoute = CacheEntry {
		Cache: true,
		Path: "public/app.html",
	}
	StaticGameRoute = CacheEntry {
		Cache: true,
		Path: "public/game.html",
	}
)

func HandleStatic(route string) func(w http.ResponseWriter, r *http.Request) {
	return func (w http.ResponseWriter, r *http.Request) {
		entry, ok := RouteCache[route]
		if ok {
			_, err := w.Write(entry)
			if err != nil {
				fmt.Println(err)
			}
			return
		}
		var routeObj CacheEntry

		switch route {
		case HomeRoute:
			routeObj = StaticHomepageRoute
		case LoginRoute:
			routeObj = StaticLoginRoute
		case RegisterRoute:
			routeObj = StaticRegisterRoute
		case AppRoute:
			routeObj = StaticAppRoute
		case GameRoute:
			routeObj = StaticGameRoute
		}

		res, err := ioutil.ReadFile(routeObj.Path)

		if err != nil {
			http.Error(w, http.StatusText(500), 500)
			fmt.Println(route, err)
			return
		}

		if routeObj.Cache {
			RouteCache[route] = res
		}
		_, err = w.Write(res)
		if err != nil {
			fmt.Println(err)
		}
	}
}