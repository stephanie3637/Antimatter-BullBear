import { Currency, CurrencyAmount, JSBI, Token, Trade } from '@uniswap/sdk'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
// import { useHistory } from 'react-router-dom'
import styled from 'styled-components'
import ReactGA from 'react-ga'
import { Text } from 'rebass'
import { ButtonError, ButtonPrimary, ButtonConfirmed } from '../../components/Button'
import Card, { OutlineCard } from '../../components/Card'
import Column, { AutoColumn } from '../../components/Column'
import ConfirmSwapModal from '../../components/swap/ConfirmSwapModal'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import { SwapPoolTabs } from '../../components/NavigationTabs'
import { AutoRow, RowBetween } from '../../components/Row'
//import AdvancedSwapDetailsDropdown from '../../components/swap/AdvancedSwapDetailsDropdown'
//import BetterTradeLink, { DefaultVersionLink } from '../../components/swap/BetterTradeLink'
//import confirmPriceImpactWithoutFee from '../../components/swap/confirmPriceImpactWithoutFee'
import { BottomGrouping, SwapCallbackError, Wrapper } from '../../components/swap/styleds'
//import TradePrice from '../../components/swap/TradePrice'
import TokenWarningModal from '../../components/TokenWarningModal'
import ProgressSteps from '../../components/ProgressSteps'
// import SwapHeader from '../../components/swap/SwapHeader'
import useTheme from 'hooks/useTheme'
import { useActiveWeb3React } from '../../hooks'
import { useCurrency, useAllTokens } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import { useSwapCallback } from '../../hooks/useSwapCallback'
import { useToggleSettingsMenu, useWalletModalToggle } from '../../state/application/hooks'
import { Auction } from '../../state/swap/actions'
import { tryParseAmount, useDefaultsFromURLSearch } from '../../state/swap/hooks'
import { useExpertModeManager, useUserSlippageTolerance, useUserSingleHopOnly } from '../../state/user/hooks'
import { TYPE } from '../../theme'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { computeTradePriceBreakdown, warningSeverity } from '../../utils/prices'
import { BodyWrapper } from '../AppBody'
import Loader from '../../components/Loader'
//import { isTradeBetter } from 'utils/trades'
import { Option, OptionPrice, usePayCurrencyAmount, useSwapInfo } from '../../state/market/hooks'
import { TypeRadioButton } from '../../components/MarketStrategy/TypeRadioButton'
import { ANTIMATTER_ROUTER_ADDRESS, INITIAL_ALLOWED_SLIPPAGE } from '../../constants'
import { useCurrencyBalance } from '../../state/wallet/hooks'
import TradePrice from '../../components/swap/TradePrice'
import { ClickableText } from '../Pool/styleds'
import SettingsTab from '../../components/Settings'
import QuestionHelper from '../../components/QuestionHelper'
import { getCurrencySymbol } from 'utils/getCurrencySymbol'

enum Field {
  OPTION = 'OPTION',
  PAY = 'PAY'
}

export enum OptionField {
  CALL = 'CALL',
  PUT = 'PUT'
}

const RadioButtonWrapper = styled(AutoColumn)`
  fieldset {
    width: 68%;
    display: grid !important;
    grid-template-columns: 50% 50%;
    ${({ theme }) => theme.mediaWidth.upToMedium`
      width: 100%;
  `}
  }
`
const Label = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text3};
  margin-bottom: 8px;
`

const SwapAppBody = styled(BodyWrapper)`
  border-color: ${({ theme }) => theme.text4};
  min-height: 100%;
  margin: -1px;
  ${({ theme }) => theme.mediaWidth.upToMedium`
  max-width: unset
  width: calc(100% + 2px)
  `}
`

export default function Swap({
  option,
  optionPrice,
  // handleOptionType,
  setParentTXHash
}: {
  option: Option | undefined
  optionPrice: OptionPrice | undefined
  // handleOptionType: (option: string) => void
  setParentTXHash: (hash: string) => void
}) {
  const loadedUrlParams = useDefaultsFromURLSearch()
  const { account, chainId } = useActiveWeb3React()

  const theme = useTheme()

  // for expert mode
  const toggleSettings = useToggleSettingsMenu()

  const [optionCurrency, setOptionCurrency] = useState<Currency>()
  const [payCurrency, setPayCurrency] = useState<Currency>()

  const optionBalance = useCurrencyBalance(account ?? undefined, optionCurrency)
  const payBalance = useCurrencyBalance(account ?? undefined, payCurrency)

  const [optionTyped, setOptionTyped] = useState<string>('')
  const [payTyped, setPayTyped] = useState<string>()

  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.inputCurrencyId),
    useCurrency(loadedUrlParams?.outputCurrencyId)
  ]
  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false)
  const [auction, setAuction] = useState<string>(Auction.BUY)
  const [optionType, setOptionType] = useState<string>(OptionField.CALL)

  const urlLoadedTokens: Token[] = useMemo(
    () => [loadedInputCurrency, loadedOutputCurrency]?.filter((c): c is Token => c instanceof Token) ?? [],
    [loadedInputCurrency, loadedOutputCurrency]
  )
  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
  }, [])

  // dismiss warning if all imported tokens are in active lists
  const defaultTokens = useAllTokens()
  const importTokensNotInDefault =
    urlLoadedTokens &&
    urlLoadedTokens.filter((token: Token) => {
      return !Boolean(token.address in defaultTokens)
    })

  // toggle wallet when disconnected
  const toggleWalletModal = useWalletModalToggle()

  // for expert mode
  const [isExpertMode] = useExpertModeManager()

  // get custom setting values for user
  const [allowedSlippage] = useUserSlippageTolerance()

  const parsedAmounts = useMemo(
    () => ({
      [Field.OPTION]: tryParseAmount(optionTyped, optionCurrency),
      [Field.PAY]: tryParseAmount(payTyped, payCurrency)
    }),
    [optionCurrency, optionTyped, payCurrency, payTyped]
  )

  //const { onSwitchTokens } = useSwapActionHandlers()

  const handleTypeInput = useCallback(
    (value: string) => {
      setOptionTyped(value)
    },
    [setOptionTyped]
  )
  const handleTypeOutput = useCallback(
    (value: string) => {
      setPayTyped(value)
    },
    [setPayTyped]
  )

  // reset if they close warning without tokens in params
  const handleDismissTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
    // history.push('/swap/')
  }, [])

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    showConfirm: boolean
    tradeToConfirm: Trade | undefined
    attemptingTxn: boolean
    swapErrorMessage: string | undefined
    txHash: string | undefined
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined
  })

  const formattedAmounts = {
    [Field.OPTION]: parsedAmounts[Field.OPTION]?.toExact() ?? '',
    [Field.PAY]: parsedAmounts[Field.PAY]?.toExact() ?? ''
  }

  const [callAmount, putAmount] = useMemo(() => {
    if (auction === Auction.BUY && optionType === OptionField.CALL) {
      return [tryParseAmount(optionTyped, optionCurrency)?.raw.toString(), '0']
    } else if (auction === Auction.BUY && optionType === OptionField.PUT) {
      return ['0', tryParseAmount(optionTyped, optionCurrency)?.raw.toString()]
    } else if (auction === Auction.SELL && optionType === OptionField.CALL) {
      return ['-' + tryParseAmount(optionTyped, optionCurrency)?.raw.toString(), '0']
    } else if (auction === Auction.SELL && optionType === OptionField.PUT) {
      return ['0', '-' + tryParseAmount(optionTyped, optionCurrency)?.raw.toString()]
    }
    return ['0', '0']
  }, [auction, optionCurrency, optionTyped, optionType])

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false)

  const maxAmountInput: CurrencyAmount | undefined = maxAmountSpend(optionBalance)
  const atMaxAmountInput = Boolean(maxAmountInput && parsedAmounts[Field.OPTION]?.equalTo(maxAmountInput))

  //const { priceImpactWithoutFee } = computeTradePriceBreakdown(trade)

  const [singleHopOnly] = useUserSingleHopOnly()

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({ showConfirm: false, tradeToConfirm, attemptingTxn, swapErrorMessage, txHash })
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      //onUserInput(Field.INPUT, '')
      setOptionTyped('')
      setPayTyped('')
    }
  }, [attemptingTxn, setPayTyped, setOptionTyped, swapErrorMessage, tradeToConfirm, txHash])

  // const handleAcceptChanges = useCallback(() => {
  //   setSwapState({ tradeToConfirm: trade, swapErrorMessage, txHash, attemptingTxn, showConfirm })
  // }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash])

  const handleInputSelect = useCallback(
    inputCurrency => {
      setApprovalSubmitted(false) // reset 2 step UI for approvals
      setOptionCurrency(inputCurrency)
    },
    [setOptionCurrency]
  )

  const handleMaxInput = useCallback(() => {
    maxAmountInput && setOptionTyped(maxAmountInput.toExact())
  }, [maxAmountInput, setOptionTyped])

  const handleOutputSelect = useCallback(outputCurrency => setPayCurrency(outputCurrency), [setPayCurrency])

  const underlying = option?.underlying
  const currency = option?.currency

  // const { undTrade: underlyingTrade, curTrade: currencyTrade } = useOptionSwapInfo(
  //   delta?.dUnd.toString(),
  //   delta?.dCur.toString(),
  //   underlying,
  //   currency,
  //   payCurrency
  // )

  useEffect(() => {
    setOptionCurrency(optionType === OptionField.CALL ? option?.call?.currency : option?.put?.currency)
  }, [optionType, option])

  const routerDelta = useSwapInfo(
    option,
    optionType === OptionField.CALL
      ? auction === Auction.BUY
        ? formattedAmounts[Field.OPTION]
        : '-' + formattedAmounts[Field.OPTION]
      : '0',
    optionType === OptionField.PUT
      ? auction === Auction.BUY
        ? formattedAmounts[Field.OPTION]
        : '-' + formattedAmounts[Field.OPTION]
      : '0',
    underlying,
    currency,
    payCurrency
  )

  const { priceImpactWithoutFee: curPriceImpact } = computeTradePriceBreakdown(routerDelta?.curTrade)

  const { priceImpactWithoutFee: undPriceImpact } = computeTradePriceBreakdown(routerDelta?.undTrade)

  const curPriceImpactSeverity = warningSeverity(curPriceImpact)

  const undPriceImpactSeverity = warningSeverity(undPriceImpact)

  const payFormattedAmount = useMemo(() => {
    if (!routerDelta?.undMax || !routerDelta.curMax) return undefined
    return JSBI.add(JSBI.BigInt(routerDelta.undMax), JSBI.BigInt(routerDelta.curMax)).toString()
  }, [routerDelta])

  const payCurrencyAmount = usePayCurrencyAmount(routerDelta, payCurrency)

  const [approval, approveCallback] = useApproveCallback(payCurrencyAmount, ANTIMATTER_ROUTER_ADDRESS)

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true)
    }
  }, [approval, approvalSubmitted])

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    approval === ApprovalState.NOT_APPROVED ||
    approval === ApprovalState.PENDING ||
    (approvalSubmitted && approval === ApprovalState.APPROVED)

  const noRoute = !routerDelta?.undPathAddresses || !routerDelta.curPathAddresses

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapCallback(
    payCurrency,
    option,
    callAmount,
    putAmount,
    routerDelta
  )

  const handleSwap = useCallback(() => {
    if (!swapCallback) {
      return
    }
    setSwapState({ attemptingTxn: true, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: undefined })
    swapCallback()
      .then(hash => {
        setSwapState({ attemptingTxn: false, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: hash })
        setParentTXHash(hash)
        ReactGA.event({
          category: 'Swap',
          action: '',
          label: [].join('/')
        })

        ReactGA.event({
          category: 'Routing',
          action: singleHopOnly ? 'Swap with multihop disabled' : 'Swap with multihop enabled'
        })
      })
      .catch(error => {
        setParentTXHash('')
        setSwapState({
          attemptingTxn: false,
          tradeToConfirm,
          showConfirm,
          swapErrorMessage: error.message,
          txHash: undefined
        })
      })
  }, [swapCallback, tradeToConfirm, showConfirm, setParentTXHash, singleHopOnly])

  const statusButton = useMemo(() => {
    const defaultContent = { disabled: false, text: '' }
    if (!optionTyped) {
      return { ...defaultContent, disabled: true, text: 'Enter amount' }
    }
    if (
      auction === Auction.SELL &&
      parsedAmounts[Field.OPTION] &&
      optionBalance &&
      parsedAmounts[Field.OPTION]?.greaterThan(optionBalance)
    ) {
      return { ...defaultContent, disabled: true, text: 'Insufficient balance' }
    }
    if (!payCurrency) {
      return {
        ...defaultContent,
        disabled: true,
        text: `Select a token`
      }
    }
    if (routerDelta?.isLoading || !payBalance) {
      return { ...defaultContent, disabled: true, text: 'Loading' }
    }
    if (!payFormattedAmount) {
      return { ...defaultContent, disabled: true, text: 'Insufficient liquidity for this trade' }
    }
    if (payFormattedAmount[0] !== '-' && payCurrencyAmount?.greaterThan(payBalance)) {
      return {
        ...defaultContent,
        disabled: true,
        text: `Insufficient ${getCurrencySymbol(payCurrency, chainId)} balance`
      }
    }
    if (noRoute || undPriceImpactSeverity > 3 || curPriceImpactSeverity > 3) {
      return { ...defaultContent, disabled: true, text: 'Insufficient liquidity for this trade' }
    }
    return defaultContent
  }, [
    optionTyped,
    auction,
    parsedAmounts,
    optionBalance,
    payCurrency,
    routerDelta,
    payFormattedAmount,
    payBalance,
    payCurrencyAmount,
    noRoute,
    undPriceImpactSeverity,
    curPriceImpactSeverity,
    chainId
  ])

  return (
    <>
      <TokenWarningModal
        isOpen={importTokensNotInDefault.length > 0 && !dismissTokenWarning}
        tokens={importTokensNotInDefault}
        onConfirm={handleConfirmTokenWarning}
        onDismiss={handleDismissTokenWarning}
      />
      <SwapPoolTabs active={'option_trading'} />
      <SwapAppBody isCard>
        {/*<SwapHeader /> */}
        <Wrapper id="swap-page" style={{ padding: '1rem 0' }}>
          <ConfirmSwapModal
            optionPrice={optionPrice}
            auction={auction as Auction}
            optionCurrencyAmount={parsedAmounts[Field.OPTION]}
            payTitle={payFormattedAmount?.[0] === '-' ? 'You will receive' : 'You will pay'}
            paySubTitle={
              'Please note that this is an approximate transaction price calculated based on the slippage you’ve selected. The actual transaction price should be more favourable.'
            }
            payCurrencyAmount={payCurrencyAmount}
            isOpen={showConfirm}
            trade={routerDelta?.undTrade ?? undefined}
            originalTrade={tradeToConfirm}
            onAcceptChanges={() => {}}
            attemptingTxn={attemptingTxn}
            txHash={txHash}
            allowedSlippage={allowedSlippage}
            onConfirm={handleSwap}
            swapErrorMessage={swapErrorMessage}
            onDismiss={handleConfirmDismiss}
          />

          <AutoColumn gap="28px">
            <div style={{ position: 'absolute', top: -5, right: 0 }}>
              <SettingsTab onlySlippage />
            </div>
            <RadioButtonWrapper gap="28px">
              <div>
                <Label>Choose Action</Label>
                <TypeRadioButton
                  name={'auction_type'}
                  options={[
                    { label: 'Buy', option: Auction.BUY },
                    { label: 'Sell', option: Auction.SELL }
                  ]}
                  selected={auction}
                  onCheck={(option: string) => setAuction(option)}
                />
              </div>
              <div>
                <Label>Choose token type</Label>
                <TypeRadioButton
                  name={'option_type'}
                  options={[
                    { label: '+ Bull Token', option: OptionField.CALL },
                    { label: '− Bear Token', option: OptionField.PUT }
                  ]}
                  selected={optionType}
                  onCheck={(option: string) => {
                    // handleOptionType(option)
                    setOptionType(option)
                  }}
                />
              </div>
            </RadioButtonWrapper>
            <CurrencyInputPanel
              hideSelect
              disableCurrencySelect={false}
              label={'Amount'}
              value={optionTyped}
              showMaxButton={!atMaxAmountInput && auction === Auction.SELL}
              currency={optionCurrency}
              onUserInput={handleTypeInput}
              onMax={handleMaxInput}
              onCurrencySelect={handleInputSelect}
              otherCurrency={payCurrency}
              id="swap-currency-input"
            />
            <CurrencyInputPanel
              hideInput={true}
              disableCurrencySelect={false}
              value={formattedAmounts[Field.PAY]}
              onUserInput={handleTypeOutput}
              label={auction === Auction.BUY ? 'Payment currency' : 'Receipt currency'}
              showMaxButton={false}
              currency={payCurrency}
              onCurrencySelect={handleOutputSelect}
              otherCurrency={optionCurrency}
              id="swap-currency-output"
            />

            {payCurrencyAmount && (
              <Card padding={'.25rem 0 0 '} borderRadius={'20px'}>
                <AutoColumn gap="8px">
                  <RowBetween align="center">
                    <Text
                      style={{ display: 'flex', alignItems: 'center' }}
                      fontWeight={500}
                      fontSize={14}
                      color={'rgba(178, 243, 85, 1)'}
                    >
                      {payFormattedAmount?.[0] === '-' ? 'You will receive' : 'You will pay'}
                      <QuestionHelper
                        size={16}
                        text={
                          'Please note that this is an approximate transaction price calculated based on the slippage you’ve selected. The actual transaction price should be more favourable.'
                        }
                      />
                    </Text>
                    <TradePrice currencyAmount={payCurrencyAmount} />
                  </RowBetween>
                  {allowedSlippage !== INITIAL_ALLOWED_SLIPPAGE && (
                    <RowBetween align="center">
                      <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                        Slippage Tolerance
                      </ClickableText>
                      <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                        {allowedSlippage / 100}%
                      </ClickableText>
                    </RowBetween>
                  )}
                </AutoColumn>
              </Card>
            )}
          </AutoColumn>
          <BottomGrouping>
            {!account ? (
              <ButtonPrimary onClick={toggleWalletModal} borderRadius="49px">
                Connect Wallet
              </ButtonPrimary>
            ) : statusButton.disabled ? (
              <OutlineCard
                style={{
                  textAlign: 'center',
                  borderRadius: '49px',
                  padding: '14px',
                  borderColor: theme.primary1,
                  fontSize: '1rem'
                }}
              >
                <TYPE.main color={theme.primary1} mb="4px">
                  {statusButton.text}
                </TYPE.main>
              </OutlineCard>
            ) : showApproveFlow ? (
              <RowBetween>
                <ButtonConfirmed
                  borderRadius="49px"
                  onClick={approveCallback}
                  disabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
                  width="48%"
                  altDisabledStyle={approval === ApprovalState.PENDING} // show solid button while waiting
                  confirmed={approval === ApprovalState.APPROVED}
                >
                  {approval === ApprovalState.PENDING ? (
                    <AutoRow gap="6px" justify="center">
                      Approving <Loader stroke="white" />
                    </AutoRow>
                  ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                    'Approved'
                  ) : (
                    'Approve ' + payCurrency?.symbol
                  )}
                </ButtonConfirmed>
                <ButtonError
                  borderRadius="49px"
                  disabled={approval !== ApprovalState.APPROVED}
                  onClick={() => {
                    setSwapState({
                      tradeToConfirm: routerDelta?.undTrade ?? undefined,
                      attemptingTxn: false,
                      swapErrorMessage: undefined,
                      showConfirm: true,
                      txHash: undefined
                    })
                  }}
                  width="48%"
                  id="swap-button"
                  error={undPriceImpactSeverity > 2 || curPriceImpactSeverity > 2}
                >
                  <Text fontSize={16} fontWeight={500}>
                    {(undPriceImpactSeverity > 3 || curPriceImpactSeverity > 3) && !isExpertMode
                      ? `Price Impact High`
                      : `Trade${undPriceImpactSeverity > 2 || curPriceImpactSeverity > 2 ? ' Anyway' : ''}`}
                  </Text>
                </ButtonError>
              </RowBetween>
            ) : (
              <ButtonError
                borderRadius="49px"
                onClick={() => {
                  setSwapState({
                    tradeToConfirm: routerDelta?.undTrade ?? undefined,
                    attemptingTxn: false,
                    swapErrorMessage: undefined,
                    showConfirm: true,
                    txHash: undefined
                  })
                }}
                disabled={undPriceImpactSeverity > 5 || curPriceImpactSeverity > 5}
                id="swap-button"
                outlined={!!swapCallbackError}
              >
                <Text fontSize={16} fontWeight={500}>
                  {(undPriceImpactSeverity > 5 || curPriceImpactSeverity > 5) && !isExpertMode
                    ? `Price Impact Too High`
                    : `Trade${undPriceImpactSeverity > 3 || curPriceImpactSeverity > 3 ? ' Anyway' : ''}`}
                </Text>
              </ButtonError>
            )}
            {showApproveFlow && (
              <Column style={{ marginTop: '1rem' }}>
                <ProgressSteps steps={[approval === ApprovalState.APPROVED]} />
              </Column>
            )}
            {isExpertMode && swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
            {/*{betterTradeLinkV2 && !swapIsUnsupported && toggledVersion === Version.v1 ? (*/}
            {/*  <BetterTradeLink version={betterTradeLinkV2} />*/}
            {/*) : toggledVersion !== DEFAULT_VERSION && defaultTrade ? (*/}
            {/*  <DefaultVersionLink />*/}
            {/*) : null}*/}
          </BottomGrouping>
        </Wrapper>

        {/*<AdvancedSwapDetailsDropdown undTrade={underlyingTrade} curTrade={currencyTrade} />*/}
      </SwapAppBody>
    </>
  )
}
