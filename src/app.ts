import Koa from "koa"
import bodyParser from "koa-xml-body"
import xml2js from "xml2js"

const app = new Koa()

app.use(bodyParser())

app.use(async ctx => {
    console.log(ctx.request.type)
    console.log(ctx.request.body)

    const builder = new xml2js.Builder()
    ctx.type = ctx.request.type
    ctx.body = builder.buildObject(ctx.request.body)
})

const port = 3000

app.listen(port, () => {
    console.log(`Local: http://127.0.0.1:${port}`)
})
