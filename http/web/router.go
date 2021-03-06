package web

import (
	"fmt"

	v1 "github.com/blobs-io/blobsgame/http/api/v1"
	"github.com/blobs-io/blobsgame/http/gateway"
	"github.com/blobs-io/blobsgame/http/web/routes"
	"github.com/gofiber/fiber"
	"github.com/gofiber/websocket"
)

var App *fiber.App

func Init(port int) {
	App = fiber.New()

	// Main routes
	App.Get("/", func(ctx *fiber.Ctx) {
		ctx.Redirect("/login")
	})
	App.Static("/", "./public/")

	App.Post("/login", routes.Login)
	App.Post("/register", routes.Register)

	// API
	App.Get("/api/v1/users/:user", v1.GetUser)
	App.Post("/api/v1/blobs/switch", v1.SwitchBlob)
	App.Post("/api/v1/daily", v1.RedeemDailyGift)
	App.Get("/api/v1/ping", v1.Ping)
	App.Get("/api/v1/rooms", v1.GetRooms)
	App.Get("/api/v1/rooms/:id", v1.GetRoom)
	App.Get("/api/v1/rooms/:id/players", v1.GetPlayers)
	App.Get("/api/v1/verify", v1.Verify)
	App.Get("/api/v1/promotions", v1.Promotions)

	// WebSocket
	App.Get("/ws", websocket.New(gateway.Handle))

	fmt.Printf("Webserver listening on port %d\n", port)
	err := App.Listen(port)
	if err != nil {
		fmt.Println(err)
	}
}