const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const express = require('express')
const axios = require('axios')

const MAIN_URL = 'https://sockshare.ac'
const app = express()
const PORT = process.env.PORT || 8080

puppeteer.use(StealthPlugin())

let browser;
let tempUrl = {};

async function startBrowser(){
    if(!browser){
        browser = await puppeteer.launch({ headless: false });
        browser.on('disconnected', () => {
            browser = null
        })
    }
}

function encodeUrl(url = ''){
    return Buffer.from(url).toString('base64')
}

function decodeUrl(url = ''){
    return Buffer.from(url, 'base64').toString('ascii')
}

async function getDetails(url){
    try {
        await startBrowser()
        const page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0')
        await page.goto(url, {waitUntil: 'load', timeout: 0});
        await page.waitForSelector('#maincontent')
        let data = await page.evaluate(() => {
            const els = document.querySelectorAll('#details .episode');
            let arr = []
            if(els.length === 0){
                return null
            }

            els.forEach(el => {
                let title = 'Epiode ' + el.innerText
                let id = el.href
                arr.push({title, id})
            })

            return arr
        })
        if(!data){
            data = [{
                id: url, title: 'Full Movie'
            }]
        }

        data = data.map(item => ({
            ...item, 
            id: encodeUrl(item.id)
        }))
        
        await page.close()
        return data
    } catch (err) {
        console.log(err)
        await browser.close()
        browser = null;
        return []
    }
}

async function getVideoUrl(url){
    try {
        await startBrowser()
        const page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0')
        await page.goto(url, {waitUntil: 'load', timeout: 0});
        await page.waitForSelector('#maincontent')
        await page.waitForSelector('#player')
        const iframeSrc = await page.$eval('#player iframe', el => el.getAttribute('src'))
        await page.goto(iframeSrc)
        await page.waitForSelector('video')
        const videoUrl = await page.$eval('video source', el => el.getAttribute('src'))
        tempUrl[url] = videoUrl
        await page.close()
        return videoUrl
    } catch (err) {
        console.log(err)
        await browser.close()
        browser = null;
        return ''
    }
}

async function getSearch(keyword){
    try {
        await startBrowser()
        const page = await browser.newPage()
        await page.goto(MAIN_URL + '/search-movies/' + keyword.replaceAll(' ', '+') + '.html')
        await page.waitForSelector('#maincontent')
        let data = await page.evaluate(() => {
            const els = document.querySelectorAll('.listcontent .item');
            let arr = []
            els.forEach(el => {
                let img = el.querySelector('.thumb img').getAttribute('src')
                let title = el.querySelector('.title').innerText
                let id = el.querySelector('.title').href
                arr.push({img, title, id})
            })

            return arr
        })
        data = data.map(item => ({
            ...item, 
            id: encodeUrl(item.id)
        }))
        await page.close()

        return data
    } catch (err) {
        await browser.close()
        browser = null;
        return [] 
    }
}

async function getHome(){
    try {
        await startBrowser()
        const page = await browser.newPage()
        await page.goto(MAIN_URL)
        await page.waitForSelector('#maincontent')
        let data = await page.evaluate(() => {
            const els = document.querySelectorAll('.listcontent .item');
            let arr = []
            els.forEach(el => {
                let img = el.querySelector('.thumb img').getAttribute('src')
                let title = el.querySelector('.title').innerText
                let id = el.querySelector('.title').href
                arr.push({img, title, id})
            })

            return arr
        })

        data = data.map(item => ({
            ...item, 
            id: encodeUrl(item.id)
        }))
        
        await page.close()
        return data
    } catch (err) {
        console.log(err)
        await browser.close()
        browser = null;
        return [] 
    }
}

app.get('/search', async (req, res) => {
    let keyword = req.query.keyword
    const data = await getSearch(keyword)
    res.send(JSON.stringify(data))
})


app.get('/details/:id', async (req, res) => {
    let id = decodeUrl(req.params.id)
    const data = await getDetails(id)
    res.send(JSON.stringify(data))
})

app.get('/', async (req, res) => {
    const data = await getHome()
    res.send(JSON.stringify(data))
})

app.get('/stream/:id', async (req, res) => {
    const id = decodeUrl(req.params.id) 
    const url = tempUrl[id] || await getVideoUrl(id)
    if(!url){
        return res.send('ERROR_NO_URL').end()
    }
    let range = req.headers['range'];
    let reqHeaders = {
        referer: 'https://eplayvid.net',
        accept: '*/*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36',
    }

	if (range) {
		reqHeaders['range'] = range
    }

    let { data, headers } = await axios({
		url: url,
		headers: reqHeaders,
		responseType: 'stream'
	}).catch((err) => {
        console.log(err)
		return res.status(404).end();
    });

	let fileSize = headers['content-length'];
	let status = 200;
	let head = {
		'Content-Length': fileSize,
		'Content-Type': 'video/mp4'
	};
	if (range && headers['content-range']) {
		status = 206;
		head = {
			'Content-Range': headers['content-range'],
			'Accept-Ranges': 'bytes',
			'Content-Length': headers['content-length'],
			'Content-Type': 'video/mp4'
		};
	}
	res.status(status)
    res.set(head)
	data.pipe(res);
})

app.listen(PORT, () => {
    console.log('Enjin Stato ' + PORT)
})