import React from 'react'
import { Collapse } from 'antd'
import FlowChart from '../FlowChart'
import styles from './index.less'

const { Panel } = Collapse

export default function () {
  return (
    <div>
      <Collapse
        accordion={true}
        bordered={false}
        expandIconPosition="right"
        className={styles.collapse}
      >
        <Panel header="流程图" key="1">
          <FlowChart />
        </Panel>
        <Panel header="类图" key="4" />
        <Panel header="时序图" key="5" />
      </Collapse>
    </div>
  )
}
