import { createClient } from '@supabase/supabase-js'
// const createClient = require('@supabase/supabase-js');
// import config from './config.js'
import twit from 'twit'
import { VERIFY_TRUE, VERIFY_FALSE, VERIFY } from './constants.js'

// console.log('process.env', process.env)
// Create a single supabase client for interacting with your database
const supabase = createClient(
    'https://xvtrvphgtmtrarhiicqb.supabase.co',
    process.env.SUPABASE_KEY
)

const config = {
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
    access_token: process.env.ACCESS_TOKEN,
    access_token_secret: process.env.ACCESS_TOKEN_SECRET,
}

const T = new twit(config)
var stream = T.stream('statuses/filter', { track: ['@covid_src'] })
stream.on('tweet', tweetEvent)

function checkTweetMsgQuery(txt = '') {
    if (
        txt.includes('verify') &&
        (txt.includes('true') || txt.includes('false'))
    ) {
        if (txt.includes('true')) {
            return VERIFY_TRUE
        } else if (txt.includes('false')) {
            return VERIFY_FALSE
        }
    } else if (txt.includes('verify')) {
        return VERIFY
    }
    return 'NONE'
}

async function tweetEvent(tweet) {
    console.log('tweet', tweet.in_reply_to_status_id_str)
    //   const tweetId = tweet.id
    const parentTweetId = tweet.in_reply_to_status_id_str
    let { data: tweetinfoRecord, error } = await supabase
        .from('tweetinfo')
        .select('*')
        .eq('parent_tweet_id', parentTweetId)

    if (tweetinfoRecord.length > 0) {
        console.log('tweetinfoRecord', tweetinfoRecord)
        let verify = null

        // checks which query user has submitted
        const executeCmd = checkTweetMsgQuery(tweet.text)
        switch (executeCmd) {
            case VERIFY_FALSE:
                verify = false
                break
            case VERIFY_TRUE:
                verify = true
                break
            case VERIFY:

            default:
                break
        }

        if (verify === true) {
            const { data, error } = await supabase
                .from('tweetinfo')
                .update({
                    votes_true: parseInt(
                        parseInt(tweetinfoRecord[0].votes_true) + parseInt(1)
                    ),
                })
                .eq('parent_tweet_id', parentTweetId)
            if (data) {
                console.log('VERIFY VOTE TO TRUE COUNT', data)
                sendTweetResponseForVotes(tweet, data)
            } else {
                console.log('VERIFY TRUE VOTE ERROR', error)
            }
        } else if (verify === false) {
            const { data, error } = await supabase
                .from('tweetinfo')
                .update({
                    votes_false: parseInt(
                        parseInt(tweetinfoRecord[0].votes_false) + parseInt(1)
                    ),
                })
                .eq('parent_tweet_id', parentTweetId)
            if (data) {
                console.log('VERIFY VOTE TO FALSE COUNT')
                sendTweetResponseForVotes(tweet, data)
            } else {
                console.log('VERIFY FALSE VOTE ERROR', error)
            }
        } else {
            sendTweetResponseForVotes(tweet, tweetinfoRecord)
        }
    } else {
        /* INSERTS new record with new data*/
        let verify = null
        const executeCmd = checkTweetMsgQuery(tweet.text)
        switch (executeCmd) {
            case VERIFY_FALSE:
                verify = false
                break
            case VERIFY_TRUE:
                verify = true
                break
            default:
                break
        }
        const { data, error } = await supabase.from('tweetinfo').insert([
            {
                tweet_id: tweet.id_str,
                parent_tweet_id: tweet.in_reply_to_status_id_str,
                votes_true: verify === true ? 1 : 0,
                votes_false: verify === false ? 1 : 0,
                users: {
                    id: tweet.user.id,
                    name: tweet.user.name,
                    screen_name: tweet.user.screen_name,
                },
            },
        ])
        if (data) {
            console.log('INSERTED NEW TWEET RECORD INTO DB')
            sendTweetResponseForNewRecord(tweet)
        } else {
            console.log(
                'Something went wrong: supabase insert operation',
                error
            )
        }
    }

    //   const userId = tweet.user.id;
    //   const { data, error } = await supabase.from('tweetinfo').insert([
    //     {
    //       tweet_id: tweet.id_str,
    //	   parent_tweet_id: tweet.in_reply_to_status_id_str
    //       votes_true: 1,
    //       votes_false: 0,
    //       users: {
    //         id: tweet.user.id,
    //         name: tweet.user.name,
    //         screen_name: tweet.user.screen_name,
    //       },
    //     },
    //   ]);

    //   if (data) {
    //     let name = tweet.user.screen_name;
    //     let nameID = tweet.id_str;

    //     // Start a reply back to the sender
    //     let reply =
    //       'You mentioned me! @' +
    //       name +
    //       ' ' +
    //       'Checking verification of covid resources';
    //     let params = {
    //       status: reply,
    //       in_reply_to_status_id: nameID,
    //     };

    //     // T.post('statuses/update', params, function (err, data, response) {
    //     //   if (err !== undefined) {
    //     //     console.log(err);
    //     //   } else {
    //     //     console.log('Tweeted: ' + params.status);
    //     //   }
    //     // });
    //   } else if (error) {
    //     console.log('supabase insert error', error);
    //   }
}

function sendTweetResponseForVotes(tweet, data) {
    let name = tweet.user.screen_name
    let nameID = tweet.id_str
    let diff = data[0].votes_true - data[0].votes_false
    // Start a reply back to the sender
    let reply =
        '@' +
        name +
        '  ' +
        'Votes for this verified resource - YES:' +
        data[0].votes_true +
        '  NO:' +
        data[0].votes_false +
        ' \nTotal verification score: ' +
        diff
    let params = {
        status: reply,
        in_reply_to_status_id: nameID,
    }

    T.post('statuses/update', params, function (err, data, response) {
        if (err !== undefined) {
            console.log('tweet reply error: ', err)
        } else {
            console.log('Tweeted: ' + params.status)
        }
    })
}

function sendTweetResponseForNewRecord(tweet) {
    let name = tweet.user.screen_name
    let nameID = tweet.id_str

    // Start a reply back to the sender
    let reply =
        '@' +
        name +
        '  ' +
        'No votes yet. You can vote now by replying in parent tweet with "verify true" or "verify false" '
    let params = {
        status: reply,
        in_reply_to_status_id: nameID,
    }

    T.post('statuses/update', params, function (err, data, response) {
        if (err !== undefined) {
            console.log('tweet reply error: ', err)
        } else {
            console.log('Tweeted: ' + params.status)
        }
    })
}

// Run every 60 seconds
// setInterval(function () {
//   retweet('#DataScience OR #DataVisualization');
// }, 60000);
